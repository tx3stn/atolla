// @ts-nocheck
import { AuthErrors } from '../errors/AuthErrors';
import type { ErrorConst } from '../errors/Const';
import { JellyfinAuthStore, type JellyfinAuthStoreLike } from '../stores/JellyfinAuthStore';

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

export interface AuthSession {
	accessToken: string;
	serverId: string;
	serverUrl: string;
	userId: string;
}

export interface QuickConnectStartResult {
	code: string;
	secret: string;
}

interface HTTPResponseLike {
	body?: Uint8Array;
	headers: Record<string, string>;
	statusCode: number;
}

interface HTTPClientLike {
	get(pathOrUrl: string, headers?: Record<string, string>): Promise<HTTPResponseLike>;
	post(
		pathOrUrl: string,
		body?: ArrayBuffer | Uint8Array,
		headers?: Record<string, string>,
	): Promise<HTTPResponseLike>;
}

interface JellyfinAuthServiceOptions {
	httpClientFactory?: (baseUrl: string) => HTTPClientLike;
	isMockMode?: boolean;
	now?: NowFn;
	sleep?: SleepFn;
	store?: JellyfinAuthStoreLike;
}

type SleepFn = (ms: number) => Promise<void>;
type NowFn = () => number;

function defaultSleep(ms: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

function normalizeServerUrl(url: string): string {
	const trimmed = url.trim();
	const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
	return withScheme.replace(/\/+$/, '');
}

function createClientHeader(): string {
	return 'MediaBrowser Client="Atolla", Device="Atolla", DeviceId="atolla", Version="0.0.1"';
}

export class JellyfinAuthService {
	private readonly store: JellyfinAuthStoreLike;
	private readonly httpClientFactory: (baseUrl: string) => HTTPClientLike;
	private readonly sleep: SleepFn;
	private readonly now: NowFn;
	private isMockMode: boolean;

	constructor(options: JellyfinAuthServiceOptions = {}) {
		this.store = options.store ?? new JellyfinAuthStore();
		this.httpClientFactory =
			options.httpClientFactory ??
			((baseUrl: string) => {
				const { HTTPClient } = require('valdi_http/src/HTTPClient');
				return new HTTPClient(baseUrl) as unknown as HTTPClientLike;
			});
		this.isMockMode = options.isMockMode ?? false;
		this.sleep = options.sleep ?? defaultSleep;
		this.now = options.now ?? (() => Date.now());
	}

	setMockMode(enabled: boolean): void {
		this.isMockMode = enabled;
	}

	loadSession(): Promise<AuthSession | null> {
		return this.store.loadSession().then((session) => session ?? null);
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

	async startQuickConnect(serverUrl: string): Promise<QuickConnectStartResult> {
		const normalizedUrl = normalizeServerUrl(serverUrl);
		if (this.isMockMode) {
			return {
				code: 'ATOLLA-MOCK',
				secret: 'atolla-mock-secret',
			};
		}

		const enabled = await this.fetchBoolean(
			normalizedUrl,
			'/QuickConnect/Enabled',
			this.createHeaders(),
		);
		if (!enabled) {
			throw AuthErrors.QUICK_CONNECT_NOT_AVAILABLE;
		}

		let response: HTTPResponseLike;
		try {
			response = await this.createHttpClient(normalizedUrl).post(
				'/QuickConnect/Initiate',
				undefined,
				this.createHeaders(),
			);
		} catch {
			throw AuthErrors.CONNECTION_ERROR;
		}

		if (response.statusCode === 401) {
			throw AuthErrors.QUICK_CONNECT_NOT_AVAILABLE;
		}
		if (!this.isSuccessStatus(response.statusCode)) {
			throw AuthErrors.CONNECTION_ERROR;
		}

		const parsed = this.parseJSON<QuickConnectResult>(response);
		if (!parsed.Secret || !parsed.Code) {
			throw AuthErrors.CONNECTION_ERROR;
		}

		return {
			code: parsed.Code,
			secret: parsed.Secret,
		};
	}

	async waitForQuickConnectApproval(
		serverUrl: string,
		secret: string,
		timeoutMs = 60_000,
		pollIntervalMs = 2_000,
	): Promise<void> {
		const normalizedUrl = normalizeServerUrl(serverUrl);
		if (this.isMockMode) {
			return;
		}

		const start = this.now();

		while (this.now() - start < timeoutMs) {
			let response: HTTPResponseLike;
			try {
				response = await this.createHttpClient(normalizedUrl).get(
					`/QuickConnect/Connect?secret=${encodeURIComponent(secret)}`,
					this.createHeaders(),
				);
			} catch {
				throw AuthErrors.CONNECTION_ERROR;
			}

			if (!this.isSuccessStatus(response.statusCode)) {
				throw AuthErrors.CONNECTION_ERROR;
			}

			const parsed = this.parseJSON<QuickConnectResult>(response);
			if (parsed.Authenticated) {
				return;
			}

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
				serverUrl: normalizedUrl,
				userId: 'mock-user-id',
			};
		}

		let response: HTTPResponseLike;
		try {
			response = await this.createHttpClient(normalizedUrl).post(
				'/Users/AuthenticateWithQuickConnect',
				new TextEncoder().encode(JSON.stringify({ Secret: secret })),
				this.createHeaders(),
			);
		} catch {
			throw AuthErrors.CONNECTION_ERROR;
		}

		if (!this.isSuccessStatus(response.statusCode)) {
			throw AuthErrors.CONNECTION_ERROR;
		}

		const parsed = this.parseJSON<QuickConnectAuthenticationResult>(response);
		if (!parsed.AccessToken || !parsed.ServerId || !parsed.User?.Id) {
			throw AuthErrors.CONNECTION_ERROR;
		}

		return {
			accessToken: parsed.AccessToken,
			serverId: parsed.ServerId,
			serverUrl: normalizedUrl,
			userId: parsed.User.Id,
		};
	}

	async validateSession(session: AuthSession): Promise<boolean> {
		if (!session || typeof session.serverUrl !== 'string') {
			return false;
		}

		if (this.isMockMode) {
			return session.accessToken.length > 0;
		}

		try {
			const response = await this.createHttpClient(session.serverUrl).get(
				'/Users/Me',
				this.createHeaders(session.accessToken),
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

		const path = `/Users/${encodeURIComponent(session.userId)}/Items?IncludeItemTypes=MusicAlbum&Recursive=true&Limit=1`;
		let response: HTTPResponseLike;
		try {
			response = await this.createHttpClient(session.serverUrl).get(
				path,
				this.createHeaders(session.accessToken),
			);
		} catch {
			throw AuthErrors.FAILED_TO_FETCH_DATA;
		}

		if (!this.isSuccessStatus(response.statusCode)) {
			throw AuthErrors.FAILED_TO_FETCH_DATA;
		}
	}

	errorMessage(error: unknown): string {
		if (error && typeof error === 'object') {
			const maybeErrorConst = error as ErrorConst<string>;
			if (typeof maybeErrorConst.msg === 'function') {
				return maybeErrorConst.msg();
			}
		}
		return AuthErrors.CONNECTION_ERROR.msg();
	}

	private async fetchBoolean(
		baseUrl: string,
		path: string,
		headers: Record<string, string>,
	): Promise<boolean> {
		let response: HTTPResponseLike;
		try {
			response = await this.createHttpClient(baseUrl).get(path, headers);
		} catch {
			throw AuthErrors.CONNECTION_ERROR;
		}

		if (!this.isSuccessStatus(response.statusCode)) {
			throw AuthErrors.CONNECTION_ERROR;
		}

		const body = this.parseJSON<boolean>(response);
		return body === true;
	}

	private parseJSON<T>(response: HTTPResponseLike): T {
		if (!response.body) {
			throw AuthErrors.CONNECTION_ERROR;
		}

		try {
			const text = new TextDecoder().decode(response.body);
			return JSON.parse(text) as T;
		} catch {
			throw AuthErrors.CONNECTION_ERROR;
		}
	}

	private createHttpClient(baseUrl: string): HTTPClientLike {
		return this.httpClientFactory(baseUrl);
	}

	private isSuccessStatus(statusCode: number): boolean {
		return statusCode >= 200 && statusCode < 300;
	}

	private createHeaders(accessToken?: string): Record<string, string> {
		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
			'X-Emby-Authorization': createClientHeader(),
		};
		if (accessToken) {
			headers['X-Emby-Token'] = accessToken;
		}
		return headers;
	}
}
