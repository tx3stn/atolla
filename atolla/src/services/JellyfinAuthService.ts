import type { HTTPResponse } from 'valdi_http/src/HTTPTypes';
import type { IHTTPClient } from 'valdi_http/src/IHTTPClient';
import { AuthErrors } from '../errors/AuthErrors';
import type { ErrorConst } from '../errors/Const';
import type { JellyfinAuthStoreLike } from '../stores/JellyfinAuthStore';
import { version } from '../version';
import { getLogger } from './Logger';

const log = getLogger('auth');

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
	sleep?: SleepFn;
	store: JellyfinAuthStoreLike;
}

type SleepFn = (ms: number) => Promise<void>;
type NowFn = () => number;

function createClientHeaderWithDeviceId(clientDeviceId: string): string {
	return `MediaBrowser Client="atolla", Device="${clientDeviceId}", DeviceId="${clientDeviceId}", Version="${version}"`;
}

function defaultSleep(ms: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

function extractErrorDetail(error: unknown): string | null {
	if (typeof error === 'string') {
		return sanitizeErrorDetail(error);
	}

	if (error instanceof Error) {
		return sanitizeErrorDetail(error.message);
	}

	if (!error || typeof error !== 'object') {
		return null;
	}

	const candidate = error as {
		code?: unknown;
		error?: unknown;
		message?: unknown;
		reason?: unknown;
		status?: unknown;
		statusCode?: unknown;
	};

	const statusCode =
		typeof candidate.statusCode === 'number'
			? candidate.statusCode
			: typeof candidate.status === 'number'
				? candidate.status
				: null;
	const statusDetail = statusCode != null ? `HTTP ${statusCode}` : null;
	const messageDetail =
		sanitizeErrorDetail(candidate.message) ??
		sanitizeErrorDetail(candidate.reason) ??
		sanitizeErrorDetail(candidate.error);

	if (statusDetail && messageDetail) {
		return `${statusDetail} ${messageDetail}`;
	}

	if (statusDetail) {
		return statusDetail;
	}

	if (messageDetail) {
		return messageDetail;
	}

	if (typeof candidate.code === 'string' && candidate.code.trim().length > 0) {
		return `code ${candidate.code.trim()}`;
	}

	try {
		const serialized = JSON.stringify(error);
		if (serialized && serialized !== '{}' && serialized !== 'null') {
			return serialized.length > 200 ? `${serialized.substring(0, 200)}…` : serialized;
		}
	} catch {
		// not serializable
	}

	return null;
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

function sanitizeErrorDetail(value: unknown): string | null {
	if (typeof value !== 'string') {
		return null;
	}

	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

export class JellyfinAuthService {
	private client: IHTTPClient;
	private readonly store: JellyfinAuthStoreLike;
	private readonly mockApprovalDelayMs: number;
	private readonly sleep: SleepFn;
	private readonly now: NowFn;
	private isMockMode: boolean;
	private clientDeviceId: string;
	private lastConnectionErrorDetail: string | null = null;

	constructor(options: JellyfinAuthServiceOptions) {
		this.client = options.client;
		this.store = options.store;
		this.isMockMode = options.isMockMode ?? false;
		this.clientDeviceId = normalizeClientDeviceId(options.clientDeviceId);
		this.mockApprovalDelayMs = options.mockApprovalDelayMs ?? 3_000;
		this.sleep = options.sleep ?? defaultSleep;
		this.now = options.now ?? (() => Date.now());
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
		this.lastConnectionErrorDetail = null;
		if (this.isMockMode) {
			return {
				code: 'ATOLLA-MOCK',
				secret: 'atolla-mock-secret',
			};
		}

		const enabledResponse = await this.client.get('/QuickConnect/Enabled', this.createHeaders());
		if (
			!this.isSuccessStatus(enabledResponse.statusCode) ||
			this.parseJSON<boolean>(enabledResponse) !== true
		) {
			throw AuthErrors.QUICK_CONNECT_NOT_AVAILABLE;
		}

		let response: HTTPResponse;

		try {
			response = await this.client.post('/QuickConnect/Initiate', undefined, this.createHeaders());
		} catch (error) {
			this.rememberConnectionError(error, 'startQuickConnect request failed');
			throw AuthErrors.CONNECTION_ERROR;
		}

		if (response.statusCode === 401) {
			throw AuthErrors.QUICK_CONNECT_NOT_AVAILABLE;
		}

		if (!this.isSuccessStatus(response.statusCode)) {
			this.rememberConnectionError(
				`HTTP ${response.statusCode}`,
				'startQuickConnect returned non-success status',
			);
			throw AuthErrors.CONNECTION_ERROR;
		}

		const parsed = this.parseJSON<QuickConnectResult>(response);
		if (!parsed.Secret || !parsed.Code) {
			this.rememberConnectionError(
				'invalid quick connect response',
				'startQuickConnect invalid body',
			);
			throw AuthErrors.CONNECTION_ERROR;
		}

		return {
			code: parsed.Code,
			secret: parsed.Secret,
		};
	}

	async waitForQuickConnectApproval(
		secret: string,
		timeoutMs = 60_000,
		pollIntervalMs = 2_000,
	): Promise<void> {
		this.lastConnectionErrorDetail = null;
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
			let response: HTTPResponse;
			try {
				response = await this.client.get(
					`/QuickConnect/Connect?secret=${encodeURIComponent(secret)}`,
					this.createHeaders(),
				);
			} catch (error) {
				this.rememberConnectionError(error, 'waitForQuickConnectApproval request failed');
				throw AuthErrors.CONNECTION_ERROR;
			}

			if (!this.isSuccessStatus(response.statusCode)) {
				this.rememberConnectionError(
					`HTTP ${response.statusCode}`,
					'waitForQuickConnectApproval returned non-success status',
				);
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
		this.lastConnectionErrorDetail = null;
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

		let response: HTTPResponse;
		try {
			response = await this.client.post(
				'/Users/AuthenticateWithQuickConnect',
				new TextEncoder().encode(JSON.stringify({ Secret: secret })),
				this.createHeaders(),
			);
		} catch (error) {
			this.rememberConnectionError(error, 'authenticateWithQuickConnect request failed');
			throw AuthErrors.CONNECTION_ERROR;
		}

		if (!this.isSuccessStatus(response.statusCode)) {
			this.rememberConnectionError(
				`HTTP ${response.statusCode}`,
				'authenticateWithQuickConnect returned non-success status',
			);
			throw AuthErrors.CONNECTION_ERROR;
		}

		const parsed = this.parseJSON<QuickConnectAuthenticationResult>(response);
		if (!parsed.AccessToken || !parsed.ServerId || !parsed.User?.Id) {
			this.rememberConnectionError(
				'invalid authentication response',
				'authenticateWithQuickConnect invalid body',
			);
			throw AuthErrors.CONNECTION_ERROR;
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
			const response = await this.client.get('/System/Info/Public', this.createHeaders());
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
			const response = await this.client.get('/Users/Me', this.createHeaders(session.accessToken));
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
			response = await this.client.get(
				`/Users/${encodeURIComponent(session.userId)}/Items?IncludeItemTypes=MusicAlbum&Recursive=true&Limit=1`,
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
		const connectionErrorMessage = AuthErrors.CONNECTION_ERROR.msg();

		if (error && typeof error === 'object') {
			const maybeErrorConst = error as ErrorConst<string>;
			if (typeof maybeErrorConst.msg === 'function') {
				const message = maybeErrorConst.msg();
				if (message === connectionErrorMessage) {
					const detail = this.lastConnectionErrorDetail;
					if (detail && detail.toLowerCase() !== connectionErrorMessage.toLowerCase()) {
						return `${message}: ${detail}`;
					}
					return 'could not reach server — check the URL and try again';
				}
				return message;
			}
		}

		const detail = extractErrorDetail(error);
		if (detail && detail.toLowerCase() !== connectionErrorMessage.toLowerCase()) {
			return `${connectionErrorMessage}: ${detail}`;
		}

		return connectionErrorMessage;
	}

	private parseJSON<T>(response: HTTPResponse): T {
		if (!response.body) {
			this.rememberConnectionError('empty response body', 'parseJSON missing body');
			throw AuthErrors.CONNECTION_ERROR;
		}

		try {
			const text = new TextDecoder().decode(response.body);
			return JSON.parse(text) as T;
		} catch (error) {
			this.rememberConnectionError(error, 'parseJSON decode failed');
			throw AuthErrors.CONNECTION_ERROR;
		}
	}

	private rememberConnectionError(error: unknown, context?: string): void {
		this.lastConnectionErrorDetail = extractErrorDetail(error);
		log.error('connection error', {
			context,
			detail: this.lastConnectionErrorDetail,
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
