import type { AuthSession } from 'atolla_core/src/models/Auth';
import type { ResolveCachedImage } from 'atolla_core/src/services/ImageCache';
import type { Transport } from 'atolla_core/src/transports/Transport';
import { LiveTransport } from 'atolla_jellyfin/src/transports/Live';
import type { DownloadService } from 'atolla_player/src/services/DownloadService';
import type { PlaylistCreateService } from 'atolla_player/src/services/PlaylistCreateService';
import type { PlaylistEditService } from 'atolla_player/src/services/PlaylistEditService';
import { OfflineTransport } from 'atolla_player/src/transports/Offline';
import { type ConnectionMode, ConnectionModes } from '../models/App';
import type { Preferences } from '../stores/Preferences';
import type { SessionManager } from './SessionManager';

export interface ConnectivityRenderState {
	connectionMode: ConnectionMode;
	isAuthRequired: boolean;
}

export interface ConnectivityDeps {
	applyState(partial: Partial<ConnectivityRenderState>): void;
	downloadService: DownloadService;
	onOnline(): void;
	onSessionExpired(): void;
	onUserChanged(userId: string): void;
	playlistCreateService: PlaylistCreateService;
	playlistEditService: PlaylistEditService;
	preferences: Preferences;
	resolveCachedImage: ResolveCachedImage;
	sessionManager: SessionManager;
	setNativeAuthToken(token: string): void;
}

// connection state machine: owns the online/offline/mock mode and the active transport, which is
// always derived from (mode, current session). coordinates auth via SessionManager but never
// implements it; it reacts to session changes by rebuilding the transport.
export class Connectivity {
	// claimed synchronously by connect() and bumped by cancelConnect(), so a cancel arriving while
	// connect() is still awaiting setMode — before there is any login to stop — is not discarded
	private connectAttempt = 0;
	private mode: ConnectionMode = ConnectionModes.offline;
	private transport!: Transport;
	private transportGeneration = 0;

	constructor(private readonly deps: ConnectivityDeps) {}

	applyDeviceName(value: string): void {
		this.deps.sessionManager.applyDeviceName(value);
	}

	// cold-start: adopt the persisted mode and stand up the transport for the restored session.
	// waitForDownloadIndex is only opted out of by the bootstrap-timeout fallback, which would
	// rather serve empty offline data than hold the splash on a store that is not responding
	async bootstrap(
		session: AuthSession | null,
		options?: { waitForDownloadIndex?: boolean },
	): Promise<void> {
		this.mode = this.deps.preferences.mode;
		if (options?.waitForDownloadIndex !== false) {
			await this.ensureDownloadIndexLoaded(session);
		}
		this.rebuildTransport(session);

		const neverConnected = !this.deps.preferences.hasStoredMode;
		this.deps.applyState({
			connectionMode: this.mode,
			isAuthRequired: session == null && (this.mode === ConnectionModes.online || neverConnected),
		});
		this.deps.onUserChanged(session != null ? session.userId : 'shared');
	}

	// abandons any connect attempt, whether or not it has reached the login yet. the mode is left
	// online: we stay on the connect screen with isAuthRequired already true, and reverting it would
	// reintroduce the fresh-install bug handleSessionChanged guards against.
	cancelConnect(): void {
		this.connectAttempt += 1;
		this.deps.sessionManager.cancelLogin();
	}

	connect(serverUrl: string): void {
		const attempt = ++this.connectAttempt;

		void (async () => {
			this.mode = ConnectionModes.online;
			await this.deps.preferences.setMode(ConnectionModes.online);
			if (attempt !== this.connectAttempt) {
				return;
			}

			try {
				// login emits onSessionChanged → handleSessionChanged rebuilds the live transport
				const session = await this.deps.sessionManager.login(serverUrl);
				// activate the user scope first so the reconnect coordinator exists, then flush any
				// work queued while offline — same online transition setMode() performs on a toggle.
				this.deps.onUserChanged(session.userId);
				this.deps.onOnline();
			} catch {
				// SessionManager.login already surfaced the auth error; stay on the connect screen
				this.deps.applyState({ connectionMode: ConnectionModes.online, isAuthRequired: true });
			}
		})();
	}

	expireSession(): void {
		if (this.deps.sessionManager.getSession() == null) {
			return;
		}
		this.expireCurrentSession();
	}

	getMode(): ConnectionMode {
		return this.mode;
	}

	getTransport(): Transport {
		return this.transport;
	}

	handleSessionChanged(session: AuthSession | null): void {
		this.rebuildTransport(session);
		// connect() sets the mode to online without touching render state, so a login from a
		// non-online mode (e.g. a fresh install's offline default) must sync connectionMode here —
		// otherwise the app renders offline over a live transport. Logging in is always online.
		this.deps.applyState({
			connectionMode: this.mode,
			isAuthRequired: this.mode === ConnectionModes.online && session == null,
		});
	}

	logout(): void {
		void (async () => {
			this.mode = ConnectionModes.online;
			await this.deps.preferences.setMode(ConnectionModes.online);
			// clearSession emits onSessionChanged(null) → handleSessionChanged rebuilds offline +
			// marks auth-required (online with no session)
			await this.deps.sessionManager.clearSession();
		})();
	}

	async reauthenticate(serverUrl: string): Promise<boolean> {
		const attempt = ++this.connectAttempt;

		try {
			const session = await this.deps.sessionManager.login(serverUrl);
			if (attempt !== this.connectAttempt) {
				return false;
			}
			this.deps.onUserChanged(session.userId);
			return await this.setMode(ConnectionModes.online);
		} catch {
			return false;
		}
	}

	async setMode(mode: ConnectionMode): Promise<boolean> {
		if (
			mode === ConnectionModes.online &&
			this.deps.sessionManager.getSession() == null &&
			this.deps.sessionManager.isSessionExpired()
		) {
			this.deps.onSessionExpired();
			return false;
		}

		try {
			await this.deps.preferences.setMode(mode);
			this.mode = mode;
			const session = this.deps.sessionManager.getSession();
			await this.ensureDownloadIndexLoaded(session);
			this.rebuildTransport(session);
			this.deps.applyState({
				connectionMode: mode,
				isAuthRequired: mode === ConnectionModes.online && session == null,
			});
			if (mode === ConnectionModes.online && session != null) {
				this.deps.onOnline();
			}
			return true;
		} catch {
			return false;
		}
	}

	// the offline transport reads the download index through synchronous getters, so it must not
	// be constructed before that index is in memory
	private ensureDownloadIndexLoaded(session: AuthSession | null): Promise<void> {
		if (this.mode === ConnectionModes.online && session != null) {
			return Promise.resolve();
		}
		return this.deps.downloadService.ensureLoaded();
	}

	private expireCurrentSession(): void {
		void (async () => {
			this.mode = ConnectionModes.offline;
			try {
				await this.deps.preferences.setMode(ConnectionModes.offline);
				await this.ensureDownloadIndexLoaded(null);
			} catch {
				// this launch is offline either way; the session still has to be dropped
			}
			await this.deps.sessionManager.expireSession();
			this.deps.onSessionExpired();
		})();
	}

	private handleSessionExpired(generation: number): void {
		if (generation !== this.transportGeneration) {
			return;
		}
		this.transportGeneration += 1;
		this.expireCurrentSession();
	}

	private rebuildTransport(session: AuthSession | null): void {
		const generation = ++this.transportGeneration;
		this.deps.setNativeAuthToken(
			this.mode === ConnectionModes.online && session != null ? session.accessToken : '',
		);
		if (this.mode === ConnectionModes.online && session != null) {
			this.transport = new LiveTransport(
				session.serverUrl,
				session.accessToken,
				session.userId,
				this.deps.sessionManager.getHttpClient(),
				{
					clientDeviceId: this.deps.sessionManager.getEffectiveDeviceId(),
					clientDeviceName: this.deps.sessionManager.getEffectiveDeviceName(),
					onSessionExpired: () => this.handleSessionExpired(generation),
					resolveCachedImage: this.deps.resolveCachedImage,
				},
			);
		} else {
			this.transport = new OfflineTransport(
				this.deps.downloadService,
				this.deps.playlistCreateService,
				this.deps.playlistEditService,
				this.deps.resolveCachedImage,
			);
		}
	}
}
