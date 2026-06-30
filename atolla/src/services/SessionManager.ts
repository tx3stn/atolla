import { AuthErrors } from '../errors/AuthErrors';
import type { Preferences } from '../stores/Preferences';
import type { AuthSession, JellyfinAuthService } from './JellyfinAuthService';

export interface AuthRenderState {
	authErrorMessage: string | null;
	isAuthenticating: boolean;
	quickConnectCode: string | null;
	serverName: string;
	serverUrlPrefill: string;
}

export interface SessionManagerDeps {
	applyState(partial: Partial<AuthRenderState>): void;
	authService: JellyfinAuthService;
	defaultDeviceId: string;
	// the current session changed (login / clear / device-id reload) — connectivity rebuilds transport
	onSessionChanged(session: AuthSession | null): void;
	// a previously-valid session was found invalid in the background — connectivity drops to offline
	onSessionInvalidated(): void;
	preferences: Preferences;
	showToast(message: string): void;
}

// Owns authentication only: the quick-connect login flow, session load/save/validate, and the
// device-id credential. Holds the current session and knows nothing about transport or connectivity
// mode — it just emits when the session changes so Connectivity can react.
export class SessionManager {
	private currentSession: AuthSession | null = null;
	private deviceIdOverride = '';

	constructor(private readonly deps: SessionManagerDeps) {}

	// device-id is an auth credential: update it on the auth service, then signal so connectivity can
	// reload the live transport with the new id (the settings view persists the value to Preferences)
	applyDeviceIdOverride(value: string): void {
		this.deviceIdOverride = this.normalizeDeviceId(value);

		this.deps.authService.setClientDeviceId(this.getEffectiveDeviceId());
		if (this.currentSession != null) {
			this.deps.onSessionChanged(this.currentSession);
		}
	}

	async clearSession(): Promise<void> {
		try {
			await this.deps.authService.clearSession();
		} catch {
			// best effort, clear what we can
		}
		this.currentSession = null;
		this.deps.onSessionChanged(null);
	}

	getAccessToken(): string {
		return this.currentSession?.accessToken ?? '';
	}

	getEffectiveDeviceId(): string {
		return this.deviceIdOverride || this.deps.defaultDeviceId;
	}

	getSession(): AuthSession | null {
		return this.currentSession;
	}

	// cold-start: apply the persisted device id, restore any saved session, prime the remembered
	// server url. Returns the session (or null) for Connectivity to build the matching transport.
	async loadSession(): Promise<AuthSession | null> {
		this.deviceIdOverride = this.normalizeDeviceId(
			this.deps.preferences.jellyfinClientDeviceIdOverride,
		);
		this.deps.authService.setClientDeviceId(this.getEffectiveDeviceId());
		const [session, rememberedServerUrl] = await Promise.all([
			this.deps.authService.loadSession(),
			this.deps.authService.loadRememberedServerUrl(),
		]);
		this.currentSession = session;
		this.deps.applyState({
			serverName: session != null ? session.serverName : '',
			serverUrlPrefill: rememberedServerUrl,
		});
		return session;
	}

	// quick-connect login flow. drives the auth render, saves + sets the session, and emits
	// onSessionChanged so Connectivity stands up the live transport. throws on failure.
	async login(serverUrl: string): Promise<AuthSession> {
		this.deps.authService.setMockMode(false);
		this.deps.applyState({
			authErrorMessage: null,
			isAuthenticating: true,
			quickConnectCode: null,
			serverUrlPrefill: serverUrl,
		});
		try {
			await this.deps.authService.rememberServerUrl(serverUrl);
			const quickConnect = await this.deps.authService.startQuickConnect(serverUrl);

			this.deps.applyState({ quickConnectCode: quickConnect.code });
			await this.deps.authService.waitForQuickConnectApproval(
				serverUrl,
				quickConnect.secret,
				60_000,
			);

			const session = await this.deps.authService.authenticateWithQuickConnect(
				serverUrl,
				quickConnect.secret,
			);
			await this.deps.authService.saveSession(session);

			this.currentSession = session;
			this.deps.onSessionChanged(session);
			this.deps.applyState({
				authErrorMessage: null,
				isAuthenticating: false,
				quickConnectCode: null,
				serverName: session.serverName,
			});

			this.deps.showToast('connected');

			try {
				await this.deps.authService.probeInitialAlbums(session);
			} catch {
				this.deps.showToast(AuthErrors.FAILED_TO_FETCH_DATA.msg());
			}
			void this.validateSessionInBackground(session);
			return session;
		} catch (error) {
			this.deps.applyState({
				authErrorMessage: this.deps.authService.errorMessage(error),
				isAuthenticating: false,
				quickConnectCode: null,
			});
			throw error;
		}
	}

	setMockMode(isMock: boolean): void {
		this.deps.authService.setMockMode(isMock);
	}

	private normalizeDeviceId(value: string): string {
		const trimmed = value.trim();
		if (trimmed.length === 0) {
			return '';
		}
		return trimmed.replace(/[^a-zA-Z0-9._-]/g, '_');
	}

	private async validateSessionInBackground(session: AuthSession): Promise<void> {
		const isValid = await this.deps.authService.validateSession(session);
		if (isValid) {
			return;
		}
		await this.clearSession();
		this.deps.onSessionInvalidated();
		this.deps.applyState({ authErrorMessage: null, quickConnectCode: null });
		this.deps.showToast(AuthErrors.SESSION_EXPIRED.msg());
	}
}
