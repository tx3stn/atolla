import { type CancelablePromise, PromiseCanceler } from 'valdi_core/src/CancelablePromise';
import type { HTTPResponse } from 'valdi_http/src/HTTPTypes';
import type { IHTTPClient } from 'valdi_http/src/IHTTPClient';
import type { JellyfinAuthStoreLike } from '../stores/JellyfinAuthStore';
import { tracked } from '../transports/Cancelable';
import { toErrorConst } from '../utils/Errors';
import { version } from '../version';
import { AuthErrors } from './AuthErrors';
import { getLogger } from './Logger';

const log = getLogger('auth');

// valdi's HTTPRequest carries no timeout and neither native client sets one: iOS inherits
// NSURLSession's 60s default, android's HttpURLConnection is left unbounded. this is the only
// deadline a request actually gets, so it has to be short enough that a wrong url reports back
// while the user is still looking at the screen.
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;

interface QuickConnectResult {
	Authenticated?: boolean;
	Code?: string;
	Secret?: string;
}

interface QuickConnectAuthenticationResult {
	AccessToken?: string;
	ServerId?: string;
	User?: {
		Id?: string;
	};
}

interface SystemInfoPublicResult {
	ServerName?: string;
}

export interface AuthSession {
	accessToken: string;
	serverId: string;
	serverName: string;
	serverUrl: string;
	userId: string;
}

// a persisted session is usable only if the identity fields marshalled into native
// calls are all non-empty strings; partial/legacy/corrupt data is treated as
// signed-out so we never hand undefined across the native bridge
function isUsableSession(session: AuthSession | null | undefined): session is AuthSession {
	return (
		session != null &&
		typeof session.serverUrl === 'string' &&
		session.serverUrl.length > 0 &&
		typeof session.accessToken === 'string' &&
		session.accessToken.length > 0 &&
		typeof session.userId === 'string' &&
		session.userId.length > 0
	);
}

export interface QuickConnectStartResult {
	code: string;
	secret: string;
}

interface JellyfinAuthServiceOptions {
	client: IHTTPClient;
	clientDeviceId?: string;
	isMockMode?: boolean;
	mockApprovalDelayMs?: number;
	now?: NowFn;
	requestTimeoutMs?: number;
	sleep?: SleepFn;
	store: JellyfinAuthStoreLike;
	timer?: TimerFn;
}

type SleepFn = (ms: number) => Promise<void>;
type NowFn = () => number;
// returns its own clear function. sleep can't serve here: a request deadline has to be cancelable
// or a 60s approval wait would leave a live timer behind for every poll it outlived.
type TimerFn = (callback: () => void, ms: number) => () => void;

function defaultTimer(callback: () => void, ms: number): () => void {
	const id = setTimeout(callback, ms);

	return () => clearTimeout(id);
}

function createClientHeaderWithDeviceId(clientDeviceId: string): string {
	return `MediaBrowser Client="atolla", Device="${clientDeviceId}", DeviceId="${clientDeviceId}", Version="${version}"`;
}

function defaultSleep(ms: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

export function normalizeServerUrl(url: string): string {
	const trimmed = url.trim();
	const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
	return withScheme.replace(/\/+$/, '');
}

function normalizeClientDeviceId(value: string | null | undefined): string {
	if (typeof value !== 'string') {
		return 'atolla';
	}

	const trimmed = value.trim();
	if (trimmed.length === 0) {
		return 'atolla';
	}

	return trimmed.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export class JellyfinAuthService {
	private client: IHTTPClient;
	private readonly store: JellyfinAuthStoreLike;
	private readonly mockApprovalDelayMs: number;
	private readonly requestTimeoutMs: number;
	private readonly sleep: SleepFn;
	private readonly now: NowFn;
	private readonly timer: TimerFn;
	private isMockMode: boolean;
	private clientDeviceId: string;

	constructor(options: JellyfinAuthServiceOptions) {
		this.client = options.client;
		this.store = options.store;
		this.isMockMode = options.isMockMode ?? false;
		this.clientDeviceId = normalizeClientDeviceId(options.clientDeviceId);
		this.mockApprovalDelayMs = options.mockApprovalDelayMs ?? 3_000;
		this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
		this.sleep = options.sleep ?? defaultSleep;
		this.now = options.now ?? (() => Date.now());
		this.timer = options.timer ?? defaultTimer;
	}

	setMockMode(enabled: boolean): void {
		this.isMockMode = enabled;
	}

	setClient(client: IHTTPClient): void {
		this.client = client;
	}

	setClientDeviceId(value: string): void {
		this.clientDeviceId = normalizeClientDeviceId(value);
	}

	loadSession(): Promise<AuthSession | null> {
		return this.store.loadSession().then((session) => (isUsableSession(session) ? session : null));
	}

	async saveSession(session: AuthSession): Promise<void> {
		if (
			!session ||
			typeof session.serverUrl !== 'string' ||
			typeof session.accessToken !== 'string' ||
			typeof session.serverId !== 'string' ||
			typeof session.userId !== 'string'
		) {
			throw AuthErrors.CONNECTION_ERROR;
		}

		await this.store.saveSession(session);
	}

	async clearSession(): Promise<void> {
		await this.store.clearSession();
	}

	async rememberServerUrl(serverUrl: string): Promise<void> {
		await this.store.rememberServerUrl(serverUrl);
	}

	loadRememberedServerUrl(): Promise<string> {
		return this.store.loadRememberedServerUrl().then((url) => url ?? '');
	}

	async startQuickConnect(): Promise<QuickConnectStartResult> {
		if (this.isMockMode) {
			return {
				code: 'ATOLLA-MOCK',
				secret: 'atolla-mock-secret',
			};
		}

		const enabledResponse = await this.send(
			() => this.client.get('/QuickConnect/Enabled', this.createHeaders()),
			'startQuickConnect enabled check',
		);

		// a host that answers but isn't jellyfin (a router page, a reverse proxy, a stray 404) is the
		// likeliest outcome of a typo'd url, and it must not be reported as "quick connect not
		// available" — that sends the user to the jellyfin dashboard to fix the wrong thing. only a
		// real jellyfin saying enabled:false earns that message.
		if (!this.isSuccessStatus(enabledResponse.statusCode)) {
			throw AuthErrors.NOT_A_JELLYFIN_SERVER;
		}

		const enabled = this.tryParseJSON<unknown>(enabledResponse);
		if (typeof enabled !== 'boolean') {
			throw AuthErrors.NOT_A_JELLYFIN_SERVER;
		}

		if (!enabled) {
			throw AuthErrors.QUICK_CONNECT_NOT_AVAILABLE;
		}

		const response = await this.send(
			() => this.client.post('/QuickConnect/Initiate', undefined, this.createHeaders()),
			'startQuickConnect initiate',
		);

		if (response.statusCode === 401) {
			throw AuthErrors.QUICK_CONNECT_NOT_AVAILABLE;
		}

		if (!this.isSuccessStatus(response.statusCode)) {
			throw this.connectionError(
				`HTTP ${response.statusCode}`,
				'startQuickConnect returned non-success status',
			);
		}

		const parsed = this.parseJSON<QuickConnectResult>(response);
		if (!parsed.Secret || !parsed.Code) {
			throw this.connectionError(
				'invalid quick connect response',
				'startQuickConnect invalid body',
			);
		}

		return {
			code: parsed.Code,
			secret: parsed.Secret,
		};
	}

	// cancelation returns rather than throws, so it is indistinguishable from approval here. the
	// caller owns the difference and must re-check its own cancel state after awaiting this.
	async waitForQuickConnectApproval(
		secret: string,
		timeoutMs = 60_000,
		pollIntervalMs = 2_000,
		options?: { isCancelled?: () => boolean },
	): Promise<void> {
		const isCancelled = () => options?.isCancelled?.() === true;

		if (this.isMockMode) {
			const delayMs = Math.max(0, this.mockApprovalDelayMs);
			if (timeoutMs < delayMs) {
				await this.sleep(timeoutMs);
				throw AuthErrors.QUICK_CONNECT_TIMED_OUT;
			}

			await this.sleep(delayMs);
			return;
		}

		const start = this.now();

		while (this.now() - start < timeoutMs) {
			if (isCancelled()) {
				return;
			}

			const response = await this.send(
				() =>
					this.client.get(
						`/QuickConnect/Connect?secret=${encodeURIComponent(secret)}`,
						this.createHeaders(),
					),
				'waitForQuickConnectApproval poll',
			);

			if (isCancelled()) {
				return;
			}

			if (!this.isSuccessStatus(response.statusCode)) {
				throw this.connectionError(
					`HTTP ${response.statusCode}`,
					'waitForQuickConnectApproval returned non-success status',
				);
			}

			const parsed = this.parseJSON<QuickConnectResult>(response);
			if (parsed.Authenticated) {
				return;
			}

			// sleep isn't interruptible, so cancel latency is bounded by one interval: the check at the
			// top of the loop is what stops a canceled attempt polling the old server for the full budget.
			await this.sleep(pollIntervalMs);
		}

		throw AuthErrors.QUICK_CONNECT_TIMED_OUT;
	}

	async authenticateWithQuickConnect(serverUrl: string, secret: string): Promise<AuthSession> {
		const normalizedUrl = normalizeServerUrl(serverUrl);

		if (this.isMockMode) {
			return {
				accessToken: `mock-token-${secret || 'default'}`,
				serverId: 'mock-server-id',
				serverName: 'atolla mock server',
				serverUrl: normalizedUrl,
				userId: 'mock-user-id',
			};
		}

		const response = await this.send(
			() =>
				this.client.post(
					'/Users/AuthenticateWithQuickConnect',
					new TextEncoder().encode(JSON.stringify({ Secret: secret })),
					this.createHeaders(),
				),
			'authenticateWithQuickConnect',
		);

		if (!this.isSuccessStatus(response.statusCode)) {
			throw this.connectionError(
				`HTTP ${response.statusCode}`,
				'authenticateWithQuickConnect returned non-success status',
			);
		}

		const parsed = this.parseJSON<QuickConnectAuthenticationResult>(response);
		if (!parsed.AccessToken || !parsed.ServerId || !parsed.User?.Id) {
			throw this.connectionError(
				'invalid authentication response',
				'authenticateWithQuickConnect invalid body',
			);
		}

		const details = await this.fetchServerDetails();

		return {
			accessToken: parsed.AccessToken,
			serverId: parsed.ServerId,
			serverName: details.ServerName ?? '',
			serverUrl: normalizedUrl,
			userId: parsed.User.Id,
		};
	}

	async fetchServerDetails(): Promise<SystemInfoPublicResult> {
		if (this.isMockMode) {
			return { ServerName: 'atolla mock server' };
		}

		try {
			const response = await this.send(
				() => this.client.get('/System/Info/Public', this.createHeaders()),
				'fetchServerDetails',
			);
			if (!this.isSuccessStatus(response.statusCode)) {
				return {};
			}
			return this.parseJSON<SystemInfoPublicResult>(response);
		} catch {
			return {};
		}
	}

	async validateSession(session: AuthSession): Promise<boolean> {
		if (!session || typeof session.serverUrl !== 'string') {
			return false;
		}

		if (this.isMockMode) {
			return session.accessToken.length > 0;
		}

		try {
			const response = await this.send(
				() => this.client.get('/Users/Me', this.createHeaders(session.accessToken)),
				'validateSession',
			);
			return this.isSuccessStatus(response.statusCode);
		} catch {
			return false;
		}
	}

	async probeInitialAlbums(session: AuthSession): Promise<void> {
		if (!session || typeof session.serverUrl !== 'string' || typeof session.userId !== 'string') {
			throw AuthErrors.FAILED_TO_FETCH_DATA;
		}

		if (this.isMockMode) {
			return;
		}

		let response: HTTPResponse;
		try {
			response = await this.send(
				() =>
					this.client.get(
						`/Users/${encodeURIComponent(session.userId)}/Items?IncludeItemTypes=MusicAlbum&Recursive=true&Limit=1`,
						this.createHeaders(session.accessToken),
					),
				'probeInitialAlbums',
			);
		} catch {
			throw AuthErrors.FAILED_TO_FETCH_DATA;
		}

		if (!this.isSuccessStatus(response.statusCode)) {
			throw AuthErrors.FAILED_TO_FETCH_DATA;
		}
	}

	// parseJSON throws CONNECTION_ERROR on a body it can't decode, which is exactly the case the
	// enabled-check ladder needs to classify as NOT_A_JELLYFIN_SERVER, so that path parses leniently.
	private tryParseJSON<T>(response: HTTPResponse): T | undefined {
		if (!response.body) {
			return undefined;
		}

		try {
			return JSON.parse(new TextDecoder().decode(response.body)) as T;
		} catch {
			return undefined;
		}
	}

	private parseJSON<T>(response: HTTPResponse): T {
		if (!response.body) {
			throw this.connectionError('empty response body', 'parseJSON missing body');
		}

		try {
			const text = new TextDecoder().decode(response.body);
			return JSON.parse(text) as T;
		} catch (error) {
			throw this.connectionError(error, 'parseJSON decode failed');
		}
	}

	private connectionError(cause: unknown, context: string) {
		const detail = typeof cause === 'string' ? cause : cause instanceof Error ? cause.message : '';
		log.error('connection error', { context, detail });
		return detail ? AuthErrors.CONNECTION_ERROR.withDetail(detail) : AuthErrors.CONNECTION_ERROR;
	}

	// every request goes through here so none can outlive the deadline. a rejection and a timeout
	// both surface as SERVER_UNREACHABLE: from the connect screen they are the same fact, and the
	// native cause is dns/socket jargon that belongs in a log rather than under the url field.
	private send(
		perform: () => CancelablePromise<HTTPResponse>,
		context: string,
		timeoutMs = this.requestTimeoutMs,
	): Promise<HTTPResponse> {
		const request = perform();
		const canceler = new PromiseCanceler();
		tracked(canceler, request);

		return new Promise<HTTPResponse>((resolve, reject) => {
			let settled = false;
			const finish = (): boolean => {
				if (settled) return false;
				settled = true;

				return true;
			};

			const clearDeadline = this.timer(() => {
				if (!finish()) return;
				canceler.cancel();
				log.error('request timed out', { context, timeoutMs });
				reject(AuthErrors.SERVER_UNREACHABLE);
			}, timeoutMs);

			request.then(
				(response) => {
					if (!finish()) return;
					clearDeadline();
					resolve(response);
				},
				(error: unknown) => {
					if (!finish()) return;
					clearDeadline();
					log.error('request failed', {
						context,
						detail: toErrorConst(error, AuthErrors.SERVER_UNREACHABLE).detail,
					});
					reject(AuthErrors.SERVER_UNREACHABLE);
				},
			);
		});
	}

	private isSuccessStatus(statusCode: number): boolean {
		return statusCode >= 200 && statusCode < 300;
	}

	private createHeaders(accessToken?: string): Record<string, string> {
		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
			'X-Emby-Authorization': createClientHeaderWithDeviceId(this.clientDeviceId),
		};
		if (accessToken) {
			headers['X-Emby-Token'] = accessToken;
		}
		return headers;
	}
}
