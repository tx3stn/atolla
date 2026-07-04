import type { Preferences } from '../stores/Preferences';
import { LiveTransport } from '../transports/Live';
import { MockTransport } from '../transports/Mock';
import { type ConnectionMode, ConnectionModes } from '../transports/Model';
import { OfflineTransport } from '../transports/Offline';
import type { Transport } from '../transports/Transport';
import type { DownloadService } from './DownloadService';
import type { AuthSession } from './JellyfinAuthService';
import type { PlaylistCreateService } from './PlaylistCreateService';
import type { PlaylistEditService } from './PlaylistEditService';
import type { SessionManager } from './SessionManager';

export interface ConnectivityRenderState {
	connectionMode: ConnectionMode;
	isAuthRequired: boolean;
}

export interface ConnectivityDeps {
	applyState(partial: Partial<ConnectivityRenderState>): void;
	downloadService: DownloadService;
	onOnline(): void;
	onUserChanged(userId: string): void;
	playlistCreateService: PlaylistCreateService;
	playlistEditService: PlaylistEditService;
	preferences: Preferences;
	sessionManager: SessionManager;
	setNativeAuthToken(token: string): void;
	showToast(message: string): void;
}

// connection state machine: owns the online/offline/mock mode and the active transport, which is
// always derived from (mode, current session). coordinates auth via SessionManager but never
// implements it; it reacts to session changes by rebuilding the transport.
export class Connectivity {
	private mode: ConnectionMode = ConnectionModes.offline;
	private transport!: Transport;

	constructor(private readonly deps: ConnectivityDeps) {}

	applyDeviceIdOverride(value: string): void {
		this.deps.sessionManager.applyDeviceIdOverride(value);
	}

	// cold-start: adopt the persisted mode and stand up the transport for the restored session
	bootstrap(session: AuthSession | null): void {
		this.mode = this.deps.preferences.mode;
		this.deps.sessionManager.setMockMode(this.mode === ConnectionModes.mock);
		this.rebuildTransport(session);
		this.deps.applyState({
			connectionMode: this.mode,
			isAuthRequired: this.mode === ConnectionModes.online && session == null,
		});
		this.deps.onUserChanged(session != null ? session.userId : 'shared');
	}

	connect(serverUrl: string): void {
		if (serverUrl.trim().toLowerCase() === 'mock') {
			void this.setMode(ConnectionModes.mock);
			return;
		}
		void (async () => {
			this.mode = ConnectionModes.online;
			await this.deps.preferences.setMode(ConnectionModes.online);
			try {
				// login emits onSessionChanged → handleSessionChanged rebuilds the live transport
				const session = await this.deps.sessionManager.login(serverUrl);
				this.deps.onUserChanged(session.userId);
			} catch {
				// SessionManager.login already surfaced the auth error; stay on the connect screen
				this.deps.applyState({ connectionMode: ConnectionModes.online, isAuthRequired: true });
			}
		})();
	}

	getMode(): ConnectionMode {
		return this.mode;
	}

	getTransport(): Transport {
		return this.transport;
	}

	// previously valid session was invalidated in the background: drop to offline so the app stays
	// usable with downloads rather than bouncing the user to the connect screen
	goOffline(): void {
		void this.setMode(ConnectionModes.offline);
	}

	handleSessionChanged(session: AuthSession | null): void {
		this.rebuildTransport(session);
		this.deps.applyState({
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
			this.deps.showToast('logged out');
		})();
	}

	async setMode(mode: ConnectionMode): Promise<boolean> {
		try {
			await this.deps.preferences.setMode(mode);
			this.deps.sessionManager.setMockMode(mode === ConnectionModes.mock);
			this.mode = mode;
			const session = this.deps.sessionManager.getSession();
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

	private rebuildTransport(session: AuthSession | null): void {
		this.deps.setNativeAuthToken(
			this.mode === ConnectionModes.online && session != null ? session.accessToken : '',
		);
		if (this.mode === ConnectionModes.online && session != null) {
			this.transport = new LiveTransport(session.serverUrl, session.accessToken, session.userId, {
				clientDeviceId: this.deps.sessionManager.getEffectiveDeviceId(),
			});
		} else if (this.mode === ConnectionModes.mock) {
			this.transport = new MockTransport();
		} else {
			this.transport = new OfflineTransport(
				this.deps.downloadService,
				this.deps.playlistCreateService,
				this.deps.playlistEditService,
			);
		}
	}
}
