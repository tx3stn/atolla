import Strings from 'atolla_core/src/Strings';
import type { AuthError } from 'atolla_core/src/services/AuthErrors';
import { ImageCache } from 'atolla_core/src/services/ImageCache';
import { configureAlbumArtMaxDimension } from 'atolla_core/src/services/ImageSource';
import { getLogger, Logger } from 'atolla_core/src/services/Logger';
import { fireAndForget } from 'atolla_core/src/utils/Async';
import { JellyfinAuthService } from 'atolla_jellyfin/src/services/JellyfinAuthService';
import { InMemoryAuthStore, JellyfinAuthStore } from 'atolla_jellyfin/src/stores/JellyfinAuthStore';
import { DownloadService } from 'atolla_player/src/services/DownloadService';
import { DownloadSyncService } from 'atolla_player/src/services/DownloadSyncService';
import { PlaylistCreateService } from 'atolla_player/src/services/PlaylistCreateService';
import {
	type PlaylistEditError,
	PlaylistEditService,
} from 'atolla_player/src/services/PlaylistEditService';
import { PlaybackStore } from 'atolla_player/src/stores/Playback';
import { Lazy } from 'foundation/src/Lazy';
import { PersistentStore } from 'persistence/src/PersistentStore';
import { StatefulComponent } from 'valdi_core/src/Component';
import { Device } from 'valdi_core/src/Device';
import { overrideLocales } from 'valdi_core/src/LocalizableStrings';
import { Locale } from 'valdi_core/src/localization/Locale';
import { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';
import { DetachedSlotRenderer } from 'valdi_core/src/slot/DetachedSlotRenderer';
import { HTTPClient } from 'valdi_http/src/HTTPClient';
import type { IWorkerServiceClient } from 'worker/src/IWorkerService';
import { startWorkerService } from 'worker/src/WorkerService';
import { AuthedApp } from './AuthedApp';
import type { DevTools } from './dev/DevTools';
import { ensureAtollaHapticsBootstrap } from './HapticsBootstrap';
import {
	ensureAtollaImageLoaderBootstrap,
	resolveAtollaCachedImage,
	setAtollaImageLoaderAuthToken,
	setAtollaImageLoaderDiskCacheMaxBytes,
} from './ImageLoaderBootstrap';
import { clearAtollaLog, shareAtollaLog, writeAtollaLog } from './LoggerNative';
import { type ConnectionMode, ConnectionModes } from './models/App';
import {
	clearAtollaNetworkStatusObserver,
	getAtollaNetworkStatus,
	setAtollaNetworkStatusObserver,
} from './NetworkReachabilityNative';
import { ensureAtollaOverlayHostBootstrap } from './OverlayHostBootstrap';
import { appServices } from './services/AppServices';
import { AssetCache } from './services/AssetCache';
import { Connectivity } from './services/Connectivity';
import {
	DownloadNativeWorkerEntryPoint,
	type IDownloadNativeWorker,
} from './services/DownloadNativeWorker';
import { NetworkStatus } from './services/NetworkStatus';
import { PlaybackOrchestrator } from './services/PlaybackOrchestrator';
import { syncToastText } from './services/ReconnectSyncCoordinator';
import { SessionController } from './services/SessionController';
import { SessionManager } from './services/SessionManager';
import { ToastService, ToastTypes } from './services/ToastService';
import { TrackPlaybackNotificationAdapter } from './services/TrackPlaybackNotificationAdapter';
import { TrackSourceNativeAdapter } from './services/TrackSourceNativeAdapter';
import { UserScope } from './services/UserScope';
import { appShellStore } from './stores/AppShell';
import { BarColorStore } from './stores/BarColor';
import { DEFAULT_LANGUAGE, type LanguageCode, Preferences } from './stores/Preferences';
import {
	getAtollaDeviceUserScopeKey,
	getAtollaDownloadedCacheTotalSizeBytes,
	getAtollaDownloadedTrackFileUrl,
	setAtollaTrackCacheMaxTracks,
	setAtollaTrackPlaybackAuthToken,
} from './TrackPlaybackNative';
import { theme } from './theme';
import { BootSplash } from './ui/components/BootSplash';
import { Modal } from './ui/components/Modal';
import { EXPANDED_ARTWORK_SIZE } from './ui/components/NowPlayingSurface';
import { Toast } from './ui/components/Toast';
import { closeSlot, EMPTY_SLOT_RENDERER } from './ui/flows/ModalSlotFlow';
import { ConnectionView } from './ui/views/ConnectionView';
import { deriveAlbumArtMaxDimension } from './utils/ImageSizing';

const BOOTSTRAP_TIMEOUT_MS = 5000;
const MINIMUM_BOOT_SPLASH_MS = 100;

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
	offlineDataInvalidations: number;
	quickConnectCode: string | null;
	serverName: string;
	serverUrlPrefill: string;
	version: number;
}

export interface AppViewModel {
	// only ever supplied by the dev app root (//atolla_app_dev); undefined in the released build
	devTools?: DevTools;
}

export class App extends StatefulComponent<AppViewModel, AppState> {
	private readonly deviceUserScopeKey = this.resolveDeviceUserScopeKey();
	private readonly defaultJellyfinClientDeviceId = `atolla-${this.deviceUserScopeKey}`;
	private authService = this.createAuthService();
	// the window width is fixed for the process lifetime (the app is portrait-only and opts out of
	// iPad multitasking), so grid sizing reads it once here rather than re-measuring per render
	private preferences = new Preferences(
		new PersistentStore('atolla/preferences', { deviceGlobal: true }),
		Device.getWindowWidth(),
	);
	private barColors = new BarColorStore();
	private sessionController = new SessionController();
	private toastService = new ToastService();
	private readonly imageCache = new ImageCache({});
	private modalSlot = new DetachedSlot();
	private toastSlot = new DetachedSlot();
	private readonly diagnosticsStore = new Lazy(
		() => new PersistentStore('atolla/diagnostics', { deviceGlobal: true }),
	);
	private readonly playlistCreateService = new PlaylistCreateService(
		new PersistentStore('atolla/playlist_creates', { deviceGlobal: true }),
	);
	private readonly playlistEditService = new PlaylistEditService(
		new PersistentStore('atolla/playlist_edits', { deviceGlobal: true }),
	);
	private playbackStore = new PlaybackStore();
	private downloadService = new DownloadService({
		cacheImage: (id, url, category) => this.assetCache.cacheImageAsset(id, url, category),
		cacheTrack: (trackId, url) =>
			this.downloadWorkerClient.target.api.cacheDownloadedTrack(
				trackId,
				url,
				this.sessionManager.getAccessToken(),
			),
		getTotalDownloadedSizeBytes: () => getAtollaDownloadedCacheTotalSizeBytes(),
		getTrackPlaybackUrl: (trackId) => getAtollaDownloadedTrackFileUrl(trackId),
		isOnline: () => this.networkStatus.isReachable(),
		onTrackDownloaded: (trackId) => {
			this.playbackOrchestrator.handleTrackCached(trackId);
			this.prefetchDownloadedTrackLyrics(trackId);
		},
		removeTrack: (trackId) => this.downloadWorkerClient.target.api.removeDownloadedTrack(trackId),
		removeTracks: (trackIds) =>
			this.downloadWorkerClient.target.api.removeDownloadedTracks(trackIds),
		store: new PersistentStore('atolla/downloads', { deviceGlobal: true }),
	});
	private playbackOrchestrator: PlaybackOrchestrator = new PlaybackOrchestrator({
		cacheAlbumArt: (id, imageUrl) => this.assetCache.cacheImageAsset(id, imageUrl, 'album_art'),
		downloads: this.downloadService,
		getAccessToken: () => this.sessionManager.getAccessToken(),
		getAudioFileUrl: (trackId) => this.assetCache.getAudioPathForWaveform(trackId),
		getTrackCacheMaxTracks: () => this.preferences.trackCacheMaxTracks,
		getTrackCacheUrl: (trackId) => this.connectivity.getTransport().getTrackCacheUrl(trackId),
		getTransportToken: () => this.connectivity.getTransport(),
		isOfflinePlaybackMode: () => this.connectivity.getMode() === ConnectionModes.offline,
		notification: new TrackPlaybackNotificationAdapter(),
		onPlaybackTick: () => {
			this.playbackOrchestrator.reconcilePlaybackState();
			this.requestRerender();
		},
		playbackStore: this.playbackStore,
		prewarmArtwork: (id, imageUrl) => this.assetCache.prewarmNowPlayingArtwork(id, imageUrl),
		refreshTrackCachedCount: () => {},
		requestOverlayRerender: () => this.requestRerender(),
		requestRerender: () => this.requestRerender(),
		resolveArtistLogoUrl: (artistId) =>
			Promise.resolve(this.connectivity.getTransport().getArtistLogoUrl(artistId)),
		showToast: (model) => this.toastService.show(model),
		trackSourceNative: new TrackSourceNativeAdapter(),
	});
	private downloadWorkerClient = new Lazy<IWorkerServiceClient<IDownloadNativeWorker>>(() =>
		startWorkerService(DownloadNativeWorkerEntryPoint, []),
	);
	private networkStatus = new NetworkStatus({
		getStatusJson: () => {
			try {
				return getAtollaNetworkStatus();
			} catch {
				return '';
			}
		},
		observe: (onChange) => {
			try {
				setAtollaNetworkStatusObserver(onChange);
			} catch {
				return () => {};
			}
			return () => {
				try {
					clearAtollaNetworkStatusObserver();
				} catch {}
			};
		},
	});
	private downloadSyncService = new DownloadSyncService({ downloadService: this.downloadService });
	private assetCache = new AssetCache();
	private sessionManager: SessionManager = new SessionManager({
		applyState: (partial) => this.applyConnectionState(partial),
		authService: this.authService,
		createHttpClient: (baseUrl) => new HTTPClient(baseUrl),
		defaultDeviceId: this.defaultJellyfinClientDeviceId,
		onSessionChanged: (session) => this.connectivity.handleSessionChanged(session),
		preferences: this.preferences,
		showToast: (message) => this.toastService.show({ message, variant: ToastTypes.error }),
	});
	private connectivity: Connectivity = new Connectivity({
		applyState: (partial) => this.applyConnectionState(partial),
		downloadService: this.downloadService,
		onOnline: () => this.startReconnectSync(),
		onUserChanged: (userId) => this.userScope.activate(userId),
		playlistCreateService: this.playlistCreateService,
		playlistEditService: this.playlistEditService,
		preferences: this.preferences,
		resolveCachedImage: (category, identity) => this.resolveCachedImage(category, identity),
		sessionManager: this.sessionManager,
		setNativeAuthToken: (token) => this.pushNativeAuthToken(token),
	});
	private userScope: UserScope = new UserScope({
		assetCache: this.assetCache,
		downloadService: this.downloadService,
		getConnectionMode: () => this.state.connectionMode,
		getTransport: () => this.connectivity.getTransport(),
		playbackOrchestrator: this.playbackOrchestrator,
		playbackStore: this.playbackStore,
		playlistCreateService: this.playlistCreateService,
		playlistEditService: this.playlistEditService,
		requestRerender: () => this.requestRerender(),
	});

	private readonly bootstrapStartedAt = Date.now();
	private bootstrapCommitTimer?: ReturnType<typeof setTimeout>;
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
		offlineDataInvalidations: 0,
		quickConnectCode: null,
		serverName: '',
		serverUrlPrefill: '',
		version: 0,
	};

	onCreate(): void {
		configureAlbumArtMaxDimension(
			deriveAlbumArtMaxDimension(EXPANDED_ARTWORK_SIZE, Device.getDisplayScale()),
		);
		this.unsubscribeToast = this.toastService.subscribe(() => {
			const active = this.toastService.getCurrent();
			this.toastSlot.slotted(
				active
					? () => {
							<Toast
								animationsEnabled={this.preferences.animationsEnabled}
								closing={active.closing}
								detail={active.model.detail}
								message={active.model.message}
								onDismissed={() => this.toastService.dismissed()}
								onTap={active.model.onTap}
								variant={active.model.variant}
							/>;
						}
					: EMPTY_SLOT_RENDERER,
			);
		});
		try {
			Logger.register({
				clearLog: clearAtollaLog,
				shareLog: shareAtollaLog,
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
		this.registerDisposable(
			this.downloadService.subscribe(() => {
				this.setState({
					downloadedSizeBytes: this.downloadService.getTotalDownloadedSizeBytes(),
					downloadedTrackCount: this.downloadService.getDownloadedTrackCount(),
					downloadingCount: this.downloadService.getDownloadingCount(),
					offlineDataInvalidations: this.downloadService.getOfflineDataInvalidations(),
				});
			}),
		);
		this.downloadService.onAppReady();
		// resume parked downloads the moment the radio comes back, not just on relaunch
		this.registerDisposable(
			this.networkStatus.subscribe(() => {
				if (this.networkStatus.isReachable()) {
					this.downloadService.onAppReady();
				}
			}),
		);
		this.playbackOrchestrator.reconcilePlaybackState();
		this.startBootstrap();
	}

	onDestroy(): void {
		void this.diagnosticsStore.target.storeString('session_active', '0').catch(() => {});
		this.playbackStore.persistNow();
		this.playbackOrchestrator.dispose();
		if (this.bootstrapCommitTimer) {
			clearTimeout(this.bootstrapCommitTimer);
		}
		if (this.unsubscribeToast) {
			this.unsubscribeToast();
		}
		this.userScope.dispose();
		if (this.downloadWorkerClient.isCreated) {
			this.downloadWorkerClient.target.dispose();
		}
		this.networkStatus.dispose();
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
					onCancelConnect={this.handleCancelConnect}
					onConnect={this.handleConnect}
					onLanguageChange={this.handleLanguageChange}
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
			lyricsService: this.userScope.getLyricsService(),
			modalSlot: this.modalSlot,
			networkStatus: this.networkStatus,
			onRequestModeChange: this.handleRequestModeChange,
			paletteQueue: this.userScope.getPaletteQueue(),
			paletteService: this.userScope.getPaletteService(),
			pinnedItemsStore: this.userScope.getPinnedItemsStore(),
			playbackOrchestrator: this.playbackOrchestrator,
			playbackStore: this.playbackStore,
			preferences: this.preferences,
			toastService: this.toastService,
			toastSlot: this.toastSlot,
			transport: this.connectivity.getTransport(),
			viewCache: this.userScope.getViewCache(),
		});
		<view style={theme.app.root}>
			<AuthedApp
				connectionMode={this.state.connectionMode}
				devTools={this.viewModel.devTools}
				downloadService={this.downloadService}
				homeViewModel={this.buildHomeViewModel()}
				libraryViewModel={this.buildLibraryViewModel()}
				lyricsService={this.userScope.getLyricsService()}
				modalSlot={this.modalSlot}
				paletteService={this.userScope.getPaletteService()}
				playbackOrchestrator={this.playbackOrchestrator}
				playbackStore={this.playbackStore}
				preferences={this.preferences}
				searchViewModel={this.buildSearchViewModel()}
				sessionController={this.sessionController}
				toastService={this.toastService}
			/>
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
			lyricsService: this.userScope.getLyricsService(),
			modalSlot: this.modalSlot,
			networkStatus: this.networkStatus,
			onThisDayService: this.userScope.getOnThisDayService(),
			paletteQueue: this.userScope.getPaletteQueue(),
			pinnedItemsStore: this.userScope.getPinnedItemsStore(),
			playbackStore: this.playbackStore,
			preferences: this.preferences,
			recentlyAddedService: this.userScope.getRecentlyAddedService(),
			recentlyPlayedTracks: this.playbackOrchestrator.getRecentlyPlayedTracks(),
			toastService: this.toastService,
			transport: this.connectivity.getTransport(),
			viewCache: this.userScope.getViewCache(),
		};
	}

	private buildLibraryViewModel() {
		return {
			connectionMode: this.state.connectionMode,
			downloadService: this.downloadService,
			imageCache: this.imageCache,
			lyricsService: this.userScope.getLyricsService(),
			modalSlot: this.modalSlot,
			networkStatus: this.networkStatus,
			offlineDataInvalidations: this.state.offlineDataInvalidations,
			paletteQueue: this.userScope.getPaletteQueue(),
			pinnedItemsStore: this.userScope.getPinnedItemsStore(),
			playbackStore: this.playbackStore,
			playlistEditService: this.playlistEditService,
			preferences: this.preferences,
			toastService: this.toastService,
			transport: this.connectivity.getTransport(),
			viewCache: this.userScope.getViewCache(),
		};
	}

	private buildSearchViewModel() {
		return {
			downloadService: this.downloadService,
			imageCache: this.imageCache,
			lyricsService: this.userScope.getLyricsService(),
			modalSlot: this.modalSlot,
			networkStatus: this.networkStatus,
			paletteQueue: this.userScope.getPaletteQueue(),
			pinnedItemsStore: this.userScope.getPinnedItemsStore(),
			playbackStore: this.playbackStore,
			playlistEditService: this.playlistEditService,
			preferences: this.preferences,
			searchStore: this.userScope.getSearchStore(),
			toastService: this.toastService,
			transport: this.connectivity.getTransport(),
			viewCache: this.userScope.getViewCache(),
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
			// cold start doesn't fire onOnline(), so kick the downloaded-collection sync here
			this.syncDownloadedCollections();
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

	private handleCancelConnect = (): void => {
		this.connectivity.cancelConnect();
	};

	private handleConnect = (serverUrl: string): void => {
		this.connectivity.connect(serverUrl);
	};

	private handleLanguageChange = (code: LanguageCode): void => {
		overrideLocales(Strings, () => [new Locale(code, undefined)]);
		void this.preferences.setLanguage(code);
		this.requestRerender();
	};

	private handleSyncBannerTap = (): void => {
		this.toastService.dismissed();
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
		await this.connectivity.bootstrap(session);
	}

	private markSessionStartAndDetectPriorCrash(): void {
		void this.diagnosticsStore.target
			.fetchString('session_active')
			.then((value) => {
				if (value === '1') {
					log.warn('previous session ended without clean shutdown');
				}
				return this.diagnosticsStore.target.storeString('session_active', '1');
			})
			.catch(() => {});
	}

	private prefetchDownloadedTrackLyrics(trackId: string): void {
		if (!this.preferences.includeLyricsInDownloads) {
			return;
		}

		const track = this.downloadService.getTrack(trackId)?.track;
		if (track) {
			appServices.get()?.lyricsService.prefetch(track);
		}
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

	private resolveCachedImage(category: string, identity: string): string | null {
		try {
			return resolveAtollaCachedImage(category, identity) || null;
		} catch {
			return null;
		}
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
					// the timeout already fired, so this must not wait on the download index too
					void this.connectivity.bootstrap(null, { waitForDownloadIndex: false });
				}
			}
			this.markSessionStartAndDetectPriorCrash();
			this.commitBootstrapped();
		})();
	}

	// reconcile downloaded playlists/genres with the server on every online transition;
	// a no-op unless the connection mode is online. single-flight in the sync service, so
	// overlapping with the cold-start trigger is safe
	private syncDownloadedCollections(): void {
		if (this.connectivity.getMode() !== ConnectionModes.online) {
			return;
		}
		fireAndForget(
			'download-sync',
			this.downloadSyncService.syncAll(this.connectivity.getTransport()),
		);
	}

	private startReconnectSync(): void {
		this.syncDownloadedCollections();
		const coordinator = this.userScope.getReconnectSync();
		if (!coordinator) return;
		const transport = this.connectivity.getTransport();
		fireAndForget(
			'reconnect-sync',
			coordinator
				.run(transport, (progress) => {
					if (this.isDestroyed()) return;
					this.toastService.showPersistent({
						message: syncToastText(progress),
						variant: ToastTypes.progress,
					});
				})
				.then((result) => {
					if (this.isDestroyed()) return;
					this.lastSyncEditErrors = result.playlistEditErrors;
					if (result.total === 0) {
						return;
					}
					if (result.status === 'partial') {
						this.toastService.show(
							{
								message: syncToastText(result),
								onTap: this.handleSyncBannerTap,
								variant: ToastTypes.error,
							},
							6000,
						);
						return;
					}
					this.toastService.show(
						{ message: syncToastText(result), variant: ToastTypes.success },
						2500,
					);
				}),
		);
	}
}
