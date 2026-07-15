import { PersistentStore } from 'persistence/src/PersistentStore';
import { StatefulComponent } from 'valdi_core/src/Component';
import { overrideLocales } from 'valdi_core/src/LocalizableStrings';
import { Locale } from 'valdi_core/src/localization/Locale';
import { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';
import { DetachedSlotRenderer } from 'valdi_core/src/slot/DetachedSlotRenderer';
import { HTTPClient } from 'valdi_http/src/HTTPClient';
import type { IWorkerServiceClient } from 'worker/src/IWorkerService';
import { startWorkerService } from 'worker/src/WorkerService';
import { AuthedApp } from './AuthedApp';
import { ensureAtollaHapticsBootstrap } from './HapticsBootstrap';
import {
	ensureAtollaImageLoaderBootstrap,
	setAtollaImageLoaderAuthToken,
	setAtollaImageLoaderDiskCacheMaxBytes,
} from './ImageLoaderBootstrap';
import {
	clearAtollaLog,
	exportAtollaLog,
	exportAtollaTextFile,
	getAtollaLogFilePath,
	shareAtollaLog,
	shareAtollaTextFile,
	writeAtollaLog,
} from './LoggerNative';
import { ensureAtollaOverlayHostBootstrap } from './OverlayHostBootstrap';
import Strings from './Strings';
import { appServices } from './services/AppServices';
import { AssetCache } from './services/AssetCache';
import type { AuthError } from './services/AuthErrors';
import { Connectivity } from './services/Connectivity';
import {
	DownloadNativeWorkerEntryPoint,
	type IDownloadNativeWorker,
} from './services/DownloadNativeWorker';
import { DownloadService } from './services/DownloadService';
import { ImageCache } from './services/ImageCache';
import { JellyfinAuthService } from './services/JellyfinAuthService';
import { getLogger, Logger } from './services/Logger';
import { PlaybackOrchestrator } from './services/PlaybackOrchestrator';
import { PlaylistCreateService } from './services/PlaylistCreateService';
import { type PlaylistEditError, PlaylistEditService } from './services/PlaylistEditService';
import type { SyncProgress } from './services/ReconnectSyncCoordinator';
import { SessionController } from './services/SessionController';
import { SessionManager } from './services/SessionManager';
import { ToastService } from './services/ToastService';
import { TrackPlaybackNotificationAdapter } from './services/TrackPlaybackNotificationAdapter';
import { TrackSourceNativeAdapter } from './services/TrackSourceNativeAdapter';
import { UserScope } from './services/UserScope';
import { appShellStore } from './stores/AppShell';
import { BarColorStore } from './stores/BarColor';
import { InMemoryAuthStore, JellyfinAuthStore } from './stores/JellyfinAuthStore';
import { PlaybackStore } from './stores/Playback';
import { DEFAULT_LANGUAGE, type LanguageCode, Preferences } from './stores/Preferences';
import {
	getAtollaDeviceUserScopeKey,
	getAtollaDownloadedCacheTotalSizeBytes,
	getAtollaDownloadedTrackFileUrl,
	setAtollaTrackCacheMaxTracks,
	setAtollaTrackPlaybackAuthToken,
} from './TrackPlaybackNative';
import { theme } from './theme';
import { type ConnectionMode, ConnectionModes } from './transports/Model';
import { BootSplash } from './ui/components/BootSplash';
import { Modal } from './ui/components/Modal';
import { SyncStatusBanner } from './ui/components/SyncStatusBanner';
import { Toast } from './ui/components/Toast';
import { closeSlot, EMPTY_SLOT_RENDERER } from './ui/flows/ModalSlotFlow';
import { ConnectionView } from './ui/views/ConnectionView';
import { fireAndForget } from './utils/Async';

const BOOTSTRAP_TIMEOUT_MS = 5000;
const MINIMUM_BOOT_SPLASH_MS = 750;

const log = getLogger('app');

interface AppState {
	authErrorMessage: AuthError | null;
	connectionMode: ConnectionMode;
	downloadedSizeBytes: number | null;
	downloadedTrackCount: number;
	downloadingCount: number;
	isAuthenticating: boolean;
	isAuthRequired: boolean;
	isBootstrapped: boolean;
	quickConnectCode: string | null;
	serverName: string;
	serverUrlPrefill: string;
	syncProgress: SyncProgress | null;
	version: number;
}

export class App extends StatefulComponent<Record<string, never>, AppState> {
	private readonly deviceUserScopeKey = this.resolveDeviceUserScopeKey();
	private readonly defaultJellyfinClientDeviceId = `atolla-${this.deviceUserScopeKey}`;
	private authService = this.createAuthService();
	private preferences = new Preferences(
		new PersistentStore('atolla/preferences', { deviceGlobal: true }),
	);
	private barColors = new BarColorStore();
	private sessionController = new SessionController();
	private toastService = new ToastService();
	private readonly imageCache = new ImageCache({});
	private modalSlot = new DetachedSlot();
	private toastSlot = new DetachedSlot();
	private readonly diagnosticsStore = new PersistentStore('atolla/diagnostics', {
		deviceGlobal: true,
	});
	private readonly playlistCreateService = new PlaylistCreateService(
		new PersistentStore('atolla/playlist_creates', { deviceGlobal: true }),
	);
	private readonly playlistEditService = new PlaylistEditService(
		new PersistentStore('atolla/playlist_edits', { deviceGlobal: true }),
	);
	private playbackStore = new PlaybackStore();
	private playbackOrchestrator: PlaybackOrchestrator = new PlaybackOrchestrator({
		cacheAlbumArt: (imageUrl) => this.assetCache.cacheImageAsset(imageUrl, 'album_art'),
		getAccessToken: () => this.sessionManager.getAccessToken(),
		getAudioFileUrl: (trackId) => this.assetCache.getAudioPathForWaveform(trackId),
		getTrackCacheUrl: (trackId) => this.connectivity.getTransport().getTrackCacheUrl(trackId),
		getTransportToken: () => this.connectivity.getTransport(),
		isOfflinePlaybackMode: () => this.connectivity.getMode() === ConnectionModes.offline,
		notification: new TrackPlaybackNotificationAdapter(),
		onPlaybackTick: () => {
			this.playbackOrchestrator.reconcilePlaybackState();
			this.requestRerender();
		},
		playbackStore: this.playbackStore,
		prewarmArtwork: (imageUrl) => this.assetCache.prewarmNowPlayingArtwork(imageUrl),
		refreshTrackCachedCount: () => {},
		requestOverlayRerender: () => this.requestRerender(),
		requestRerender: () => this.requestRerender(),
		resolveArtistLogoUrl: (artistId) =>
			Promise.resolve(this.connectivity.getTransport().getArtistLogoUrl(artistId)),
		showPlaybackToast: (message) => this.toastService.show(message),
		trackSourceNative: new TrackSourceNativeAdapter(),
	});
	private downloadWorkerClient: IWorkerServiceClient<IDownloadNativeWorker> = startWorkerService(
		DownloadNativeWorkerEntryPoint,
		[],
	);
	private downloadService = new DownloadService({
		cacheImage: (url, category) => this.assetCache.cacheImageAsset(url, category),
		cacheTrack: (trackId, url) =>
			this.downloadWorkerClient.api.cacheDownloadedTrack(
				trackId,
				url,
				this.sessionManager.getAccessToken(),
			),
		getTotalDownloadedSizeBytes: () => getAtollaDownloadedCacheTotalSizeBytes(),
		getTrackPlaybackUrl: (trackId) => getAtollaDownloadedTrackFileUrl(trackId),
		onTrackDownloaded: (trackId) => this.playbackOrchestrator.handleTrackCached(trackId),
		removeTrack: (trackId) => this.downloadWorkerClient.api.removeDownloadedTrack(trackId),
		removeTracks: (trackIds) => this.downloadWorkerClient.api.removeDownloadedTracks(trackIds),
		store: new PersistentStore('atolla/downloads', { deviceGlobal: true }),
	});
	private assetCache = new AssetCache();
	private sessionManager: SessionManager = new SessionManager({
		applyState: (partial) => this.applyConnectionState(partial),
		authService: this.authService,
		createHttpClient: (baseUrl) => new HTTPClient(baseUrl),
		defaultDeviceId: this.defaultJellyfinClientDeviceId,
		onSessionChanged: (session) => this.connectivity.handleSessionChanged(session),
		preferences: this.preferences,
		showToast: (message) => this.toastService.show(message),
	});
	private connectivity: Connectivity = new Connectivity({
		applyState: (partial) => this.applyConnectionState(partial),
		downloadService: this.downloadService,
		onOnline: () => this.startReconnectSync(),
		onUserChanged: (userId) => this.userScope.activate(userId),
		playlistCreateService: this.playlistCreateService,
		playlistEditService: this.playlistEditService,
		preferences: this.preferences,
		sessionManager: this.sessionManager,
		setNativeAuthToken: (token) => this.pushNativeAuthToken(token),
		showToast: (message) => this.toastService.show(message),
	});
	private userScope: UserScope = new UserScope({
		assetCache: this.assetCache,
		downloadService: this.downloadService,
		getTransport: () => this.connectivity.getTransport(),
		playbackOrchestrator: this.playbackOrchestrator,
		playbackStore: this.playbackStore,
		playlistCreateService: this.playlistCreateService,
		playlistEditService: this.playlistEditService,
		requestRerender: () => this.requestRerender(),
	});

	private readonly bootstrapStartedAt = Date.now();
	private bootstrapCommitTimer?: ReturnType<typeof setTimeout>;
	private syncBannerTimer?: ReturnType<typeof setTimeout>;
	private lastSyncEditErrors: Array<PlaylistEditError> = [];
	private unsubscribeToast?: () => void;
	private readonly handleRequestModeChange = (mode: ConnectionMode): Promise<boolean> =>
		this.connectivity.setMode(mode);

	state: AppState = {
		authErrorMessage: null,
		connectionMode: ConnectionModes.offline,
		downloadedSizeBytes: null,
		downloadedTrackCount: 0,
		downloadingCount: 0,
		isAuthenticating: false,
		isAuthRequired: false,
		isBootstrapped: false,
		quickConnectCode: null,
		serverName: '',
		serverUrlPrefill: '',
		syncProgress: null,
		version: 0,
	};

	onCreate(): void {
		this.unsubscribeToast = this.toastService.subscribe(() => {
			const message = this.toastService.getMessage();
			this.toastSlot.slotted(
				message
					? () => {
							<Toast message={message} />;
						}
					: EMPTY_SLOT_RENDERER,
			);
		});
		try {
			Logger.register({
				clearLog: clearAtollaLog,
				exportLog: exportAtollaLog,
				exportTextFile: exportAtollaTextFile,
				getLogFilePath: getAtollaLogFilePath,
				shareLog: shareAtollaLog,
				shareTextFile: shareAtollaTextFile,
				writeLog: writeAtollaLog,
			});
		} catch {
			// native logger unavailable (e.g. desktop/test environment)
		}
		this.installGlobalRejectionHandler();
		this.installGlobalErrorHandler();
		void this.playlistCreateService.load();
		try {
			ensureAtollaImageLoaderBootstrap();
		} catch {
			// Android native bootstrap may be unavailable on non-Android targets
		}
		try {
			ensureAtollaHapticsBootstrap();
		} catch {
			// native bootstrap may be unavailable on non-Android/iOS targets
		}
		try {
			ensureAtollaOverlayHostBootstrap();
		} catch {
			// overlay-window spike bootstrap is iOS-only
		}
		this.playbackOrchestrator.start();
		this.sessionController.register({
			applyDeviceIdOverride: (value) => this.connectivity.applyDeviceIdOverride(value),
			connectionMode: () => this.state.connectionMode,
			defaultDeviceId: () => this.defaultJellyfinClientDeviceId,
			logout: () => this.connectivity.logout(),
			requestModeChange: (mode) => this.connectivity.setMode(mode),
			serverName: () => this.state.serverName,
			serverUrl: () => this.state.serverUrlPrefill,
		});
		this.registerDisposable(this.preferences.subscribe(() => this.requestRerender()));
		this.downloadService.subscribe(() => {
			this.setState({
				downloadedSizeBytes: this.downloadService.getTotalDownloadedSizeBytes(),
				downloadedTrackCount: this.downloadService.getDownloadedTrackCount(),
				downloadingCount: this.downloadService.getDownloadingCount(),
			});
		});
		this.downloadService.onAppReady();
		this.playbackOrchestrator.reconcilePlaybackState();
		this.startBootstrap();
	}

	onDestroy(): void {
		void this.diagnosticsStore.storeString('session_active', '0').catch(() => {});
		this.playbackStore.persistNow();
		this.playbackOrchestrator.dispose();
		if (this.bootstrapCommitTimer) {
			clearTimeout(this.bootstrapCommitTimer);
		}
		if (this.unsubscribeToast) {
			this.unsubscribeToast();
		}
		if (this.syncBannerTimer) {
			clearTimeout(this.syncBannerTimer);
		}
		this.userScope.dispose();
		this.downloadWorkerClient.dispose();
	}

	onRender(): void {
		if (!this.state.isBootstrapped) {
			<BootSplash />;
			return;
		}

		if (this.state.isAuthRequired) {
			appServices.clear();
			appShellStore.reset();
			<view style={theme.app.root}>
				<ConnectionView
					animationsEnabled={this.preferences.animationsEnabled}
					errorMessage={this.state.authErrorMessage}
					isConnecting={this.state.isAuthenticating}
					modalSlot={this.modalSlot}
					onConnect={(serverUrl) => this.connectivity.connect(serverUrl)}
					onLanguageChange={(code) => this.handleLanguageChange(code)}
					quickConnectCode={this.state.quickConnectCode}
					selectedLanguage={this.preferences.language}
					serverUrl={this.state.serverUrlPrefill}
					toastService={this.toastService}
				/>
				<DetachedSlotRenderer detachedSlot={this.modalSlot} />
				<DetachedSlotRenderer detachedSlot={this.toastSlot} />
			</view>;
			return;
		}

		appServices.set({
			barColors: this.barColors,
			connectionMode: this.state.connectionMode,
			downloadingCount: this.state.downloadingCount,
			downloadService: this.downloadService,
			imageCache: this.imageCache,
			modalSlot: this.modalSlot,
			onRequestModeChange: this.handleRequestModeChange,
			paletteQueue: this.userScope.getPaletteQueue(),
			paletteService: this.userScope.getPaletteService(),
			playbackOrchestrator: this.playbackOrchestrator,
			playbackStore: this.playbackStore,
			preferences: this.preferences,
			toastService: this.toastService,
			toastSlot: this.toastSlot,
			transport: this.connectivity.getTransport(),
		});
		<view style={theme.app.root}>
			<AuthedApp
				connectionMode={this.state.connectionMode}
				downloadService={this.downloadService}
				homeViewModel={this.buildHomeViewModel()}
				libraryViewModel={this.buildLibraryViewModel()}
				modalSlot={this.modalSlot}
				paletteService={this.userScope.getPaletteService()}
				playbackOrchestrator={this.playbackOrchestrator}
				playbackStore={this.playbackStore}
				preferences={this.preferences}
				searchViewModel={this.buildSearchViewModel()}
				sessionController={this.sessionController}
				toastService={this.toastService}
			/>
			{this.state.syncProgress != null && (
				<SyncStatusBanner
					completed={this.state.syncProgress.completed}
					onTap={this.handleSyncBannerTap}
					status={this.state.syncProgress.status}
					total={this.state.syncProgress.total}
				/>
			)}
		</view>;
	}

	private applyConnectionState(partial: Partial<AppState>): void {
		if (this.isDestroyed()) {
			return;
		}
		this.setState(partial);
	}

	private applyLoadedSettingsEffects(): void {
		try {
			setAtollaImageLoaderDiskCacheMaxBytes(this.preferences.imageCacheMaxBytes);
		} catch {
			// native disk cache unavailable on non-Android targets
		}
		const trackCacheMaxTracks = this.preferences.trackCacheMaxTracks;
		if (Number.isFinite(trackCacheMaxTracks) && trackCacheMaxTracks > 0) {
			try {
				setAtollaTrackCacheMaxTracks(trackCacheMaxTracks);
			} catch {
				// native track cache limit unavailable on non-Android targets
			}
		}
		if (this.preferences.language !== DEFAULT_LANGUAGE) {
			overrideLocales(Strings, () => [new Locale(this.preferences.language, undefined)]);
		}
		Logger.setEnabled(this.preferences.debugLoggingEnabled);
	}

	private buildHomeViewModel() {
		return {
			connectionMode: this.state.connectionMode,
			downloadService: this.downloadService,
			imageCache: this.imageCache,
			modalSlot: this.modalSlot,
			onThisDayService: this.userScope.getOnThisDayService(),
			paletteQueue: this.userScope.getPaletteQueue(),
			playbackStore: this.playbackStore,
			preferences: this.preferences,
			recentlyAddedService: this.userScope.getRecentlyAddedService(),
			recentlyPlayedTracks: this.playbackOrchestrator.getRecentlyPlayedTracks(),
			toastService: this.toastService,
			transport: this.connectivity.getTransport(),
		};
	}

	private buildLibraryViewModel() {
		return {
			connectionMode: this.state.connectionMode,
			downloadService: this.downloadService,
			imageCache: this.imageCache,
			modalSlot: this.modalSlot,
			paletteQueue: this.userScope.getPaletteQueue(),
			playbackStore: this.playbackStore,
			playlistEditService: this.playlistEditService,
			preferences: this.preferences,
			toastService: this.toastService,
			transport: this.connectivity.getTransport(),
		};
	}

	private buildSearchViewModel() {
		return {
			downloadService: this.downloadService,
			focusSignal: 0,
			imageCache: this.imageCache,
			modalSlot: this.modalSlot,
			paletteQueue: this.userScope.getPaletteQueue(),
			playbackStore: this.playbackStore,
			playlistEditService: this.playlistEditService,
			preferences: this.preferences,
			searchStore: this.userScope.getSearchStore(),
			toastService: this.toastService,
			transport: this.connectivity.getTransport(),
		};
	}

	private closeModalSlot = (): void => {
		closeSlot(this.modalSlot);
	};

	private commitBootstrapped(): void {
		if (this.bootstrapCommitTimer != null || this.state.isBootstrapped) {
			return;
		}
		const elapsed = Date.now() - this.bootstrapStartedAt;
		const remaining = Math.max(0, MINIMUM_BOOT_SPLASH_MS - elapsed);
		this.bootstrapCommitTimer = setTimeout(() => {
			if (this.isDestroyed()) return;
			this.setState({ isBootstrapped: true });
			this.playbackOrchestrator.notifyAppReady();
		}, remaining);
	}

	private createAuthService(): JellyfinAuthService {
		const authStoreNamespace = `atolla/device-user/${this.deviceUserScopeKey}/jellyfin_auth`;
		const sharedOptions = {
			client: new HTTPClient(),
			clientDeviceId: this.defaultJellyfinClientDeviceId,
		};

		try {
			return new JellyfinAuthService({
				...sharedOptions,
				store: new JellyfinAuthStore(
					new PersistentStore(authStoreNamespace, {
						deviceGlobal: true,
						enableEncryption: true,
					}),
				),
			});
		} catch {
			return new JellyfinAuthService({
				...sharedOptions,
				store: new InMemoryAuthStore(),
			});
		}
	}

	private handleLanguageChange(code: LanguageCode): void {
		overrideLocales(Strings, () => [new Locale(code, undefined)]);
		void this.preferences.setLanguage(code);
		this.requestRerender();
	}

	private handleSyncBannerTap = (): void => {
		if (this.syncBannerTimer) {
			clearTimeout(this.syncBannerTimer);
			this.syncBannerTimer = undefined;
		}
		this.setState({ syncProgress: null });
		const errors = this.lastSyncEditErrors;
		if (errors.length === 0) {
			return;
		}
		const errorBody = errors
			.map((e) => Strings.playlistEditErrorBody(e.type, e.playlistName, e.error))
			.join('\n\n');
		this.modalSlot.slotted(() => {
			<Modal
				body={errorBody}
				onClose={this.closeModalSlot}
				title={Strings.playlistEditErrorTitle()}
			/>;
		});
	};

	private installGlobalErrorHandler(): void {
		try {
			const globalScope = globalThis as unknown as {
				addEventListener?: (type: string, handler: (event: unknown) => void) => void;
				onerror?: ((...args: Array<unknown>) => void) | null;
			};
			const handler = (raw: unknown): void => {
				const error =
					(raw as { error?: unknown })?.error ?? (raw as { message?: unknown })?.message ?? raw;
				log.error('uncaught error', {
					message: error instanceof Error ? error.message : String(error),
					stack: error instanceof Error ? error.stack : undefined,
				});
			};
			if (typeof globalScope.addEventListener === 'function') {
				globalScope.addEventListener('error', handler);
			} else {
				globalScope.onerror = (...args: Array<unknown>) => handler(args[4] ?? args[0]);
			}
		} catch {
			// runtime does not support a global error hook, per-call guards cover us
		}
	}

	private installGlobalRejectionHandler(): void {
		try {
			const globalScope = globalThis as unknown as {
				addEventListener?: (type: string, handler: (event: unknown) => void) => void;
				onunhandledrejection?: ((event: unknown) => void) | null;
			};
			const handler = (event: unknown): void => {
				const reason = (event as { reason?: unknown })?.reason ?? event;
				log.error('swallowed async error', {
					message: reason instanceof Error ? reason.message : String(reason),
				});
				try {
					(event as { preventDefault?: () => void })?.preventDefault?.();
				} catch {
					// preventDefault not supported, logging already done
				}
			};
			if (typeof globalScope.addEventListener === 'function') {
				globalScope.addEventListener('unhandledrejection', handler);
			} else {
				globalScope.onunhandledrejection = handler;
			}
		} catch {
			// runtime does not support a global rejection hook, per-call guards cover us
		}
	}

	private async loadAndConnect(): Promise<void> {
		await this.preferences.load();
		this.applyLoadedSettingsEffects();
		const session = await this.sessionManager.loadSession();
		this.connectivity.bootstrap(session);
	}

	private markSessionStartAndDetectPriorCrash(): void {
		void this.diagnosticsStore
			.fetchString('session_active')
			.then((value) => {
				if (value === '1') {
					log.warn('previous session ended without clean shutdown');
				}
				return this.diagnosticsStore.storeString('session_active', '1');
			})
			.catch(() => {});
	}

	private pushNativeAuthToken(token: string): void {
		try {
			setAtollaImageLoaderAuthToken(token);
		} catch {
			// native image loader bootstrap may be unavailable on non-Android/iOS targets
		}
		try {
			setAtollaTrackPlaybackAuthToken(token);
		} catch {
			// native playback module may be unavailable on non-Android/iOS targets
		}
	}

	private requestRerender(): void {
		if (this.isDestroyed()) {
			return;
		}
		this.setState({ version: this.state.version + 1 });
	}

	private resolveDeviceUserScopeKey(): string {
		try {
			const raw = getAtollaDeviceUserScopeKey();
			if (typeof raw !== 'string') {
				return 'unknown';
			}
			const trimmed = raw.trim();
			if (trimmed.length === 0) {
				return 'unknown';
			}
			return trimmed.replace(/[^a-zA-Z0-9._-]/g, '_');
		} catch {
			return 'unknown';
		}
	}

	private scheduleSyncBannerDismiss(durationMs: number): void {
		if (this.syncBannerTimer) {
			clearTimeout(this.syncBannerTimer);
		}
		this.syncBannerTimer = setTimeout(() => {
			this.syncBannerTimer = undefined;
			if (this.isDestroyed()) return;
			this.setState({ syncProgress: null });
		}, durationMs);
	}

	private startBootstrap(): void {
		void (async () => {
			try {
				await Promise.race([
					this.loadAndConnect(),
					new Promise<never>((_, reject) =>
						setTimeout(() => reject(new Error('bootstrap timeout')), BOOTSTRAP_TIMEOUT_MS),
					),
				]);
			} catch {
				if (!this.isDestroyed() && !this.state.isBootstrapped) {
					this.connectivity.bootstrap(null);
				}
			}
			this.markSessionStartAndDetectPriorCrash();
			this.commitBootstrapped();
		})();
	}

	private startReconnectSync(): void {
		const coordinator = this.userScope.getReconnectSync();
		if (!coordinator) return;
		const transport = this.connectivity.getTransport();
		fireAndForget(
			'reconnect-sync',
			coordinator
				.run(transport, (progress) => {
					if (this.isDestroyed()) return;
					this.setState({ syncProgress: progress });
				})
				.then((result) => {
					if (this.isDestroyed()) return;
					this.lastSyncEditErrors = result.playlistEditErrors;
					if (result.total === 0) {
						this.setState({ syncProgress: null });
						return;
					}
					this.setState({ syncProgress: result });
					this.scheduleSyncBannerDismiss(result.status === 'partial' ? 6000 : 2500);
				}),
		);
	}
}
