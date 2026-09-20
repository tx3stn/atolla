import Strings from 'atolla_app/src/Strings';
import type { AuthSession } from 'atolla_core/src/models/Auth';
import { AuthErrors } from 'atolla_core/src/services/AuthErrors';
import { type InternalError, isErrorConst } from 'atolla_core/src/utils/Errors';
import { CLIENT_APP, createClientHeader } from 'atolla_jellyfin/src/ClientIdentity';
import {
	type JellyfinAuthService,
	normalizeServerUrl,
} from 'atolla_jellyfin/src/services/JellyfinAuthService';
import type { IHTTPClient } from 'valdi_http/src/IHTTPClient';
import type { Preferences } from '../stores/Preferences';

export interface AuthRenderState {
	authErrorMessage: InternalError<string> | null;
	isAuthenticating: boolean;
	quickConnectCode: string | null;
	serverName: string;
	serverUrlPrefill: string;
}

export interface SessionManagerDeps {
	applyState(partial: Partial<AuthRenderState>): void;
	authService: JellyfinAuthService;
	// builds the per-server HTTP client at the connect/bootstrap seam. injected so this service
	// stays free of valdi value imports and remains unit-testable (valdi imports need bazel).
	createHttpClient(baseUrl?: string): IHTTPClient;
	defaultDeviceName: string;
	// the current session changed (login / clear / identity reload) — connectivity rebuilds transport
	onSessionChanged(session: AuthSession | null): void;
	preferences: Preferences;
	showToast(message: string): void;
}

// Owns authentication only: the quick-connect login flow, session load/save/validate, and the
// device-id credential. Holds the current session and knows nothing about transport or connectivity
// mode — it just emits when the session changes so Connectivity can react.
export class SessionManager {
	private currentClient: IHTTPClient;
	private currentSession: AuthSession | null = null;
	private deviceName = '';
	private sessionExpired = false;
	// bumped by cancelLogin and by each new attempt, so a superseded or canceled login can neither
	// write render state nor adopt a session it no longer owns
	private loginGeneration = 0;

	constructor(private readonly deps: SessionManagerDeps) {
		this.currentClient = deps.createHttpClient();
	}

	applyDeviceName(value: string): void {
		this.deviceName = value;

		this.deps.authService.setClientDeviceName(this.getEffectiveDeviceName());
		if (this.currentSession != null) {
			this.deps.onSessionChanged(this.currentSession);
		}
	}

	// abandons any in-flight login and returns the connect screen to a clean, retryable state.
	// all three fields go out together: an intermediate render with isAuthenticating still true
	// would leave the connect button disabled while the user is retyping the url.
	cancelLogin(): void {
		this.loginGeneration += 1;
		this.deps.applyState({
			authErrorMessage: null,
			isAuthenticating: false,
			quickConnectCode: null,
		});
	}

	async clearSession(): Promise<void> {
		try {
			await this.deps.authService.clearSession();
		} catch {
			// best effort, clear what we can
		}
		this.currentSession = null;
		this.sessionExpired = false;
		this.deps.onSessionChanged(null);
	}

	async expireSession(): Promise<void> {
		try {
			await this.deps.authService.expireSession();
		} catch {
			// best effort, clear what we can
		}
		this.currentSession = null;
		this.sessionExpired = true;
		this.deps.onSessionChanged(null);
	}

	getAccessToken(): string {
		return this.currentSession?.accessToken ?? '';
	}

	getAuthHeader(): string {
		return createClientHeader(
			{
				client: CLIENT_APP,
				deviceId: this.getEffectiveDeviceId(),
				deviceName: this.getEffectiveDeviceName(),
			},
			this.getAccessToken(),
		);
	}

	getEffectiveDeviceId(): string {
		return this.deps.preferences.jellyfinClientDeviceId;
	}

	getEffectiveDeviceName(): string {
		return this.deviceName.trim() || this.deps.defaultDeviceName;
	}

	getHttpClient(): IHTTPClient {
		return this.currentClient;
	}

	getSession(): AuthSession | null {
		return this.currentSession;
	}

	isSessionExpired(): boolean {
		return this.sessionExpired;
	}

	// cold-start: apply the persisted device id, restore any saved session, prime the remembered
	// server url. Returns the session (or null) for Connectivity to build the matching transport.
	async loadSession(): Promise<AuthSession | null> {
		this.deviceName = this.deps.preferences.jellyfinClientDeviceName;
		this.deps.authService.setClientDeviceId(this.getEffectiveDeviceId());
		this.deps.authService.setClientDeviceName(this.getEffectiveDeviceName());
		const [session, rememberedServerUrl, sessionExpired] = await Promise.all([
			this.deps.authService.loadSession(),
			this.deps.authService.loadRememberedServerUrl(),
			this.deps.authService.loadSessionExpired(),
		]);
		this.currentSession = session;
		this.sessionExpired = sessionExpired;
		if (session != null) {
			this.bindHttpClient(session.serverUrl);
		}
		this.deps.applyState({
			serverName: session != null ? session.serverName : '',
			serverUrlPrefill: rememberedServerUrl,
		});
		return session;
	}

	// quick-connect login flow. drives the auth render, saves + sets the session, and emits
	// onSessionChanged so Connectivity stands up the live transport. throws on failure.
	async login(serverUrl: string): Promise<AuthSession> {
		// claimed before the first await so the spinner still appears synchronously
		const generation = ++this.loginGeneration;
		const isStale = () => generation !== this.loginGeneration;
		const applyIfCurrent = (partial: Partial<AuthRenderState>) => {
			if (isStale()) {
				return;
			}
			this.deps.applyState(partial);
		};

		this.deps.authService.setMockMode(false);
		this.bindHttpClient(serverUrl);
		applyIfCurrent({
			authErrorMessage: null,
			isAuthenticating: true,
			quickConnectCode: null,
			serverUrlPrefill: serverUrl,
		});
		try {
			await this.deps.authService.rememberServerUrl(serverUrl);
			if (isStale()) throw AuthErrors.LOGIN_CANCELED;

			const quickConnect = await this.deps.authService.startQuickConnect();
			if (isStale()) throw AuthErrors.LOGIN_CANCELED;

			applyIfCurrent({ quickConnectCode: quickConnect.code });
			await this.deps.authService.waitForQuickConnectApproval(quickConnect.secret, 60_000, 2_000, {
				isCancelled: isStale,
			});
			// the wait returns rather than throws on cancel, so this check is what distinguishes a
			// cancelation from a genuine approval
			if (isStale()) throw AuthErrors.LOGIN_CANCELED;

			const session = await this.deps.authService.authenticateWithQuickConnect(
				serverUrl,
				quickConnect.secret,
			);
			// checked before the write: a canceled attempt must not leave a session on disk for a
			// server the user has already moved on from, which would silently restore next launch
			if (isStale()) throw AuthErrors.LOGIN_CANCELED;
			await this.deps.authService.saveSession(session);

			this.currentSession = session;
			this.sessionExpired = false;
			this.deps.onSessionChanged(session);
			applyIfCurrent({
				authErrorMessage: null,
				isAuthenticating: false,
				quickConnectCode: null,
				serverName: session.serverName,
			});

			try {
				await this.deps.authService.probeInitialAlbums(session);
			} catch {
				this.deps.showToast(Strings.errorsAuthFailedToFetch());
			}
			return session;
		} catch (error: unknown) {
			// the isErrorConst branch keeps a non-sentinel throw from reaching the view, which has
			// copy only for error codes it knows
			applyIfCurrent({
				authErrorMessage: isErrorConst(error)
					? error
					: AuthErrors.CONNECTION_ERROR.withDetail(error instanceof Error ? error.message : ''),
				isAuthenticating: false,
				quickConnectCode: null,
			});
			throw error;
		}
	}

	private bindHttpClient(serverUrl: string): void {
		this.currentClient = this.deps.createHttpClient(normalizeServerUrl(serverUrl));
		this.deps.authService.setClient(this.currentClient);
	}
}
