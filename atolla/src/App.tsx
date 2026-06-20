import { PersistentStore } from 'persistence/src/PersistentStore';
import { AssetOutputType, addAssetLoadObserver } from 'valdi_core/src/Asset';
import { $slot } from 'valdi_core/src/CompilerIntrinsics';
import { StatefulComponent } from 'valdi_core/src/Component';
import { Device } from 'valdi_core/src/Device';
import { overrideLocales } from 'valdi_core/src/LocalizableStrings';
import { Locale } from 'valdi_core/src/localization/Locale';
import { Style } from 'valdi_core/src/Style';
import { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';
import { DetachedSlotRenderer } from 'valdi_core/src/slot/DetachedSlotRenderer';
import type { NavigationController } from 'valdi_navigation/src/NavigationController';
import { NavigationRoot } from 'valdi_navigation/src/NavigationRoot';
import type { IWorkerServiceClient } from 'worker/src/IWorkerService';
import { startWorkerService } from 'worker/src/WorkerService';
import {
	clearAtollaDebugLog,
	exportAtollaDebugLog,
	exportAtollaTextFile,
	getAtollaDebugLogFilePath,
	shareAtollaDebugLog,
	shareAtollaTextFile,
	writeAtollaDebugLog,
} from './DebugLoggerNative';
import { AuthErrors } from './errors/AuthErrors';
import { ensureAtollaHapticsBootstrap } from './HapticsBootstrap';
import {
	clearAtollaNativeCacheCategories,
	ensureAtollaImageLoaderBootstrap,
	preloadAtollaImages,
	requestAtollaImageLoaderDiskCacheStats,
	setAtollaImageCachedObserver,
	setAtollaImageLoaderDiskCacheMaxBytes,
} from './ImageLoaderBootstrap';
import type { Album } from './models/Album';
import { type FooterTab, FooterTabs, type HeaderTab, HeaderTabs } from './models/App';
import type { Artist } from './models/Artist';
import type { Playlist } from './models/Playlist';
import { sanitizeTracks, type Track } from './models/Track';
import Strings from './Strings';
import { ArtworkPaletteService } from './services/ArtworkPaletteService';
import { DebugLogger } from './services/DebugLogger';
import {
	DownloadNativeWorkerEntryPoint,
	type IDownloadNativeWorker,
} from './services/DownloadNativeWorker';
import { DownloadService } from './services/DownloadService';
import { type ClearCacheSelection, ImageCache, type ImageCategory } from './services/ImageCache';
import { buildImageSource } from './services/ImageSource';
import { type AuthSession, JellyfinAuthService } from './services/JellyfinAuthService';
import {
	buildOfflineDiagnosticsReport,
	serializeOfflineDiagnostics,
} from './services/OfflineDiagnostics';
import { OnThisDayService } from './services/OnThisDayService';
import { PaletteGenerationQueue } from './services/PaletteGenerationQueue';
import { PersistentPaletteStore } from './services/PersistentPaletteStore';
import { PersistentWaveformStore } from './services/PersistentWaveformStore';
import { PlaylistCreateService } from './services/PlaylistCreateService';
import { type PlaylistEditError, PlaylistEditService } from './services/PlaylistEditService';
import { ReconnectSyncCoordinator, type SyncProgress } from './services/ReconnectSyncCoordinator';
import { ScrobbleService } from './services/ScrobbleService';
import { TrackPlaybackNativePrefetchQueue } from './services/TrackPlaybackNativePrefetchQueue';
import {
	applyTrackPlaybackNotificationAction,
	buildTrackPlaybackNotificationPayload,
	normalizeTrackPlaybackNotificationAction,
} from './services/TrackPlaybackNotificationSync';
import {
	buildPlaybackQueueWindow,
	serializeQueueWindow,
} from './services/TrackPlaybackUpcomingQueue';
import { WaveformGenerationQueue } from './services/WaveformGenerationQueue';
import { WaveformRenderCache } from './services/WaveformRenderCache';
import { WaveformService } from './services/WaveformService';
import { WriteBehindPaletteStore } from './services/WriteBehindPaletteStore';
import { BarColorStore } from './stores/BarColor';
import { InMemoryAuthStore, JellyfinAuthStore } from './stores/JellyfinAuthStore';
import { PlaybackStore } from './stores/Playback';
import {
	DEFAULT_GRID_COLUMNS,
	DEFAULT_IMAGE_CACHE_MAX_BYTES,
	DEFAULT_LANGUAGE,
	DEFAULT_TRACK_CACHE_MAX_TRACKS,
	type LanguageCode,
	Preferences,
} from './stores/Preferences';
import { SearchStore } from './stores/Search';
import {
	cacheAtollaTrackFromUrlAsync,
	clearAtollaTrackCache,
	clearAtollaTrackPlaybackNotification,
	consumeAtollaTrackPlaybackNotificationAction,
	ensureAtollaTrackPlaybackNotificationPermission,
	getAtollaAudioPlaybackCurrentTrackId,
	getAtollaAudioPlaybackIsActive,
	getAtollaAudioPlaybackPositionMs,
	getAtollaCachedTrackFileUrl,
	getAtollaDeviceUserScopeKey,
	getAtollaDownloadedCacheTotalSizeBytes,
	getAtollaDownloadedTrackFileUrl,
	getAtollaTrackCacheEntryCount,
	setAtollaAudioPlaybackUpcomingQueue,
	setAtollaTrackCacheMaxTracks,
	updateAtollaTrackPlaybackNotification,
} from './TrackPlaybackNative';
import { theme } from './theme';
import { LiveTransport } from './transports/Live';
import { MockTransport } from './transports/Mock';
import { type ConnectionMode, ConnectionModes } from './transports/Model';
import { OfflineTransport } from './transports/Offline';
import type { Transport } from './transports/Transport';
import { BootSplash } from './ui/components/BootSplash';
import { ErrorBoundary } from './ui/components/ErrorBoundary';
import { FooterNav } from './ui/components/FooterNav';
import { GaplessPlayer } from './ui/components/GaplessPlayer';
import { LibraryHeaderNav } from './ui/components/LibraryHeaderNav';
import { MockPlayer } from './ui/components/MockPlayer';
import { Modal } from './ui/components/Modal';
import { NowPlayingSurface } from './ui/components/NowPlayingSurface';
import { SyncStatusBanner } from './ui/components/SyncStatusBanner';
import { Toast } from './ui/components/Toast';
import { ToastService } from './ui/components/ToastService';
import { closeSlot, EMPTY_SLOT_RENDERER } from './ui/flows/modalSlotFlow';
import type { NavBarContext } from './ui/NavBarContext';
import { AlbumView } from './ui/views/AlbumView';
import { ArtistView } from './ui/views/ArtistView';
import { ConnectionView } from './ui/views/ConnectionView';
import { GenreView } from './ui/views/GenreView';
import { HomeView } from './ui/views/HomeView';
import { type LibraryNavContext, LibraryView } from './ui/views/LibraryView';
import { PlaylistView } from './ui/views/PlaylistView';
import { type SearchLibraryNavigationTarget, SearchView } from './ui/views/SearchView';
import { SettingsView } from './ui/views/SettingsView';
import { fireAndForget } from './utils/Async';
import { version } from './version';

export type AppViewModel = Record<string, never>;

const RECENTLY_PLAYED_TRACKS_KEY = 'recently_played_tracks';
/**
 * Safety-net wait for the native "image cached" observer. Cache hits and successful
 * fetches report back promptly, so this only bounds the rare case where the observer
 * never fires (e.g. native that predates the cache-hit notification) before the
 * download is allowed to complete regardless.
 */
const IMAGE_CACHE_RESOLVE_TIMEOUT_MS = 6000;

interface AppState {
	activeFooterTab: FooterTab;
	activeLibraryTab: HeaderTab;
	animationsEnabled: boolean;
	authErrorMessage: string | null;
	connectionMode: ConnectionMode;
	debugExportPath: string | null;
	debugLogFilePath: string | null;
	debugLoggingEnabled: boolean;
	downloadedSizeBytes: number | null;
	downloadedTrackCount: number;
	downloadingCount: number;
	gridColumns: number;
	imageCacheMaxBytes: number;
	imageCategoryCounts: Record<string, number>;
	isAuthenticating: boolean;
	isAuthRequired: boolean;
	isBootstrapped: boolean;
	isHomeHeaderVisible: boolean;
	isHomeNavigationMounted: boolean;
	isLibraryHeaderVisible: boolean;
	isSettingsMounted: boolean;
	jellyfinClientDeviceIdOverride: string;
	language: LanguageCode;
	libraryLetterFilter: string | null;
	libraryResetNonce: number;
	nativeImageCacheDiskBytes: number;
	nativeImageCacheDiskCount: number;
	nextTrackSourceUrl: string | null;
	nowPlayingCollapseSignal: number;
	offlineStatusExportPath: string | null;
	quickConnectCode: string | null;
	searchFocusSignal: number;
	serverName: string;
	serverUrlPrefill: string;
	syncProgress: SyncProgress | null;
	trackCacheMaxTracks: number;
	trackPlaybackCachedCount: number;
	trackPlaybackSourceUrl: string | null;
	version: number;
}

export class App extends StatefulComponent<AppViewModel, AppState> {
	private closeModalSlot = (): void => {
		closeSlot(this.modalSlot);
	};
	private playbackStore = new PlaybackStore();
	private barColors = new BarColorStore();
	private readonly deviceUserScopeKey = this.resolveDeviceUserScopeKey();
	private readonly defaultJellyfinClientDeviceId = `atolla-${this.deviceUserScopeKey}`;
	private jellyfinClientDeviceIdOverride = '';
	private currentLibraryNavContext: LibraryNavContext | null = null;
	private preferences = new Preferences(
		new PersistentStore('atolla/preferences', { deviceGlobal: true }),
	);
	private authService = this.createAuthService();

	private createAuthService(): JellyfinAuthService {
		const authStoreNamespace = `atolla/device-user/${this.deviceUserScopeKey}/jellyfin_auth`;
		const clientDeviceId = this.getEffectiveJellyfinClientDeviceId();
		const sharedOptions = { clientDeviceId };
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

	private normalizeJellyfinClientDeviceIdOverride(value: string): string {
		const trimmed = value.trim();
		if (trimmed.length === 0) {
			return '';
		}

		return trimmed.replace(/[^a-zA-Z0-9._-]/g, '_');
	}

	private getEffectiveJellyfinClientDeviceId(): string {
		return this.jellyfinClientDeviceIdOverride || this.defaultJellyfinClientDeviceId;
	}

	private searchStore!: SearchStore;
	private recentlyPlayedStore?: {
		fetchString(key: string): Promise<string>;
		storeString(key: string, value: string): Promise<void>;
	};
	private nowPlayingQueueStore?: {
		fetchString(key: string): Promise<string>;
		storeString(key: string, value: string): Promise<void>;
	};
	private homeAlbumsStore?: {
		fetchString(key: string): Promise<string>;
		storeString(key: string, value: string): Promise<void>;
	};
	private readonly playlistCreateService = new PlaylistCreateService(
		new PersistentStore('atolla/playlist_creates', { deviceGlobal: true }),
	);
	private readonly playlistEditService = new PlaylistEditService(
		new PersistentStore('atolla/playlist_edits', { deviceGlobal: true }),
	);
	private readonly diagnosticsStore = new PersistentStore('atolla/diagnostics', {
		deviceGlobal: true,
	});
	private transport!: Transport;
	private reconnectSync?: ReconnectSyncCoordinator;
	private onThisDayService?: OnThisDayService;
	private lastSyncEditErrors: Array<PlaylistEditError> = [];
	private syncBannerTimer?: ReturnType<typeof setTimeout>;
	private currentAccessToken = '';
	private paletteService!: ArtworkPaletteService;
	private downloadWorkerClient: IWorkerServiceClient<IDownloadNativeWorker> = startWorkerService(
		DownloadNativeWorkerEntryPoint,
		[],
	);
	private downloadService = new DownloadService({
		cacheImage: (url, category) => this.cacheImageAsset(url, category),
		cacheTrack: (trackId, url) =>
			this.downloadWorkerClient.api.cacheDownloadedTrack(trackId, url, this.currentAccessToken),
		getTotalDownloadedSizeBytes: () => getAtollaDownloadedCacheTotalSizeBytes(),
		getTrackPlaybackUrl: (trackId) => getAtollaDownloadedTrackFileUrl(trackId),
		onTrackDownloaded: (trackId) => this.handleTrackCached(trackId),
		removeTrack: (trackId) => this.downloadWorkerClient.api.removeDownloadedTrack(trackId),
		removeTracks: (trackIds) => this.downloadWorkerClient.api.removeDownloadedTracks(trackIds),
		store: new PersistentStore('atolla/downloads', { deviceGlobal: true }),
	});
	/** Resolvers waiting on the native "image cached" observer, keyed by category + stripped url. */
	private readonly pendingImageCacheResolvers = new Map<string, Array<() => void>>();
	private paletteQueue!: PaletteGenerationQueue;
	private waveformService!: WaveformService;
	private waveformQueue!: WaveformGenerationQueue;
	private waveformRenderCache!: WaveformRenderCache;
	private unsubscribePlayback?: () => void;
	private unsubscribePalette?: () => void;
	private unsubscribeWaveform?: () => void;
	private unsubscribeWaveformRender?: () => void;
	private unsubscribeToast?: () => void;
	private scrobbleService?: ScrobbleService;
	private nativeCacheStatsInterval?: ReturnType<typeof setInterval>;
	private nativePlaybackActionInterval?: ReturnType<typeof setInterval>;
	private lastArtworkUrl: string | null = null;
	private resolvingArtistLogoId: string | null = null;
	private homeNavigationController?: NavigationController;
	private homeNavigationNonce = 0;
	private settingsNavigationNonce = 0;
	private libraryNavigationController?: NavigationController;
	private pendingArtistId: string | null = null;
	private pendingArtistFallbackName: string = 'Unknown Artist';
	private pendingArtistFallbackLogoUrl: string | null = null;
	private isResolvingArtistNavigation = false;
	private pendingAlbum: Album | null = null;
	private isResolvingAlbumNavigation = false;
	private pendingPlaylist: Playlist | null = null;
	private pendingSearchNavigation: SearchLibraryNavigationTarget | null = null;
	private isResolvingSearchNavigation = false;
	private returnToSearchOnDetailClose = false;
	private nowPlayingOverlaySlot = new DetachedSlot();
	private modalSlot = new DetachedSlot();
	private toastSlot = new DetachedSlot();
	private readonly toastService = new ToastService();
	private pendingNavRestoreContext: LibraryNavContext | null = null;
	private readonly minimumBootSplashMs = 750;
	private bootstrapStartedAt = Date.now();
	private bootstrapCommitTimer?: ReturnType<typeof setTimeout>;
	private lastTrackSourceTrackId: string | null = null;
	private lastTrackFetchErrorTrackId: string | null = null;
	private playbackSourceRequestId = 0;
	private inFlightTrackDownloadIds = new Set<string>();
	private lastPlaybackEventKey = '';
	private playbackSourceBoundTimeout?: ReturnType<typeof setTimeout>;
	private playbackReadySource = '';
	private playbackSourceRetryKeys = new Set<string>();
	private lastPrefetchTracksRef: Array<Track> | null = null;
	private lastPrefetchTrackIndex = -1;
	private lastPrefetchTransport: Transport | null = null;
	private lastWaveformPriorityTracksRef: Array<Track> | null = null;
	private lastWaveformPriorityTrackIndex = -1;
	private lastTrackNotificationStateKey = '';
	private lastTrackNotificationPositionBucket = -1;
	private lastPlaybackSignature = '';
	private lastPlaybackTickAt = 0;
	private lastUpcomingQueueKey = '';
	private readonly imageCache = new ImageCache({});
	private recentlyPlayedTracks: Array<Track> = [];
	private lastObservedRecentTrackId: string | null = null;
	private recentlyPlayedRestoring = false;
	private trackPrefetchQueue = new TrackPlaybackNativePrefetchQueue(
		(track) => this.transport.getTrackCacheUrl(track.id),
		(trackId) => this.getNativeCachedTrackSource(trackId) != null,
		(trackId, url, onComplete) => {
			cacheAtollaTrackFromUrlAsync(trackId, url, this.currentAccessToken, (rawSource) => {
				onComplete(rawSource ? this.normalizePlaybackFileSource(rawSource) : null);
			});
		},
		(trackId) => this.handleTrackCached(trackId),
	);

	state: AppState = {
		activeFooterTab: FooterTabs.home,
		activeLibraryTab: HeaderTabs.artists,
		animationsEnabled: true,
		authErrorMessage: null,
		connectionMode: ConnectionModes.offline,
		debugExportPath: null,
		debugLogFilePath: null,
		debugLoggingEnabled: false,
		downloadedSizeBytes: null,
		downloadedTrackCount: 0,
		downloadingCount: 0,
		gridColumns: DEFAULT_GRID_COLUMNS,
		imageCacheMaxBytes: DEFAULT_IMAGE_CACHE_MAX_BYTES,
		imageCategoryCounts: {},
		isAuthenticating: false,
		isAuthRequired: false,
		isBootstrapped: false,
		isHomeHeaderVisible: false,
		isHomeNavigationMounted: true,
		isLibraryHeaderVisible: true,
		isSettingsMounted: false,
		jellyfinClientDeviceIdOverride: '',
		language: DEFAULT_LANGUAGE,
		libraryLetterFilter: null,
		libraryResetNonce: 0,
		nativeImageCacheDiskBytes: 0,
		nativeImageCacheDiskCount: 0,
		nextTrackSourceUrl: null,
		nowPlayingCollapseSignal: 0,
		offlineStatusExportPath: null,
		quickConnectCode: null,
		searchFocusSignal: 0,
		serverName: '',
		serverUrlPrefill: '',
		syncProgress: null,
		trackCacheMaxTracks: DEFAULT_TRACK_CACHE_MAX_TRACKS,
		trackPlaybackCachedCount: 0,
		trackPlaybackSourceUrl: null,
		version: 0,
	};

	onCreate(): void {
		this.bootstrapStartedAt = Date.now();
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
			DebugLogger.register({
				clearLog: clearAtollaDebugLog,
				exportLog: exportAtollaDebugLog,
				exportTextFile: exportAtollaTextFile,
				getLogFilePath: getAtollaDebugLogFilePath,
				shareLog: shareAtollaDebugLog,
				shareTextFile: shareAtollaTextFile,
				writeLog: writeAtollaDebugLog,
			});
		} catch {
			// Native logger unavailable (e.g. desktop/test environment)
		}
		this.installGlobalRejectionHandler();
		this.installGlobalErrorHandler();
		void this.playlistCreateService.load();
		try {
			ensureAtollaImageLoaderBootstrap();
		} catch {
			// Android native bootstrap may be unavailable on non-Android targets.
		}
		try {
			ensureAtollaHapticsBootstrap();
		} catch {
			// Native bootstrap may be unavailable on non-Android/iOS targets.
		}
		this.nativeCacheStatsInterval = setInterval(() => {
			if (this.state.activeFooterTab === FooterTabs.settings) {
				this.refreshNativeCacheStats();
			}
		}, 1000);
		this.nativePlaybackActionInterval = setInterval(() => {
			this.handleNativePlaybackNotificationAction();
		}, 350);
		Promise.race([
			Promise.all([
				this.preferences.getGridColumns(),
				this.preferences.getImageCacheMaxBytes(),
				this.preferences.getAnimationsEnabled(),
				this.preferences.getMode(),
				this.preferences.getTrackCacheMaxTracks(),
				this.preferences.getJellyfinClientDeviceIdOverride(),
				this.preferences.getLanguage(),
				this.authService.loadSession(),
				this.authService.loadRememberedServerUrl(),
				this.preferences.getDebugLoggingEnabled(),
			]),
			new Promise<never>((_, reject) =>
				setTimeout(() => reject(new Error('preferences load timeout')), 5000),
			),
		])
			.then(
				([
					gridColumns,
					imageCacheMaxBytes,
					animationsEnabled,
					mode,
					trackCacheMaxTracks,
					jellyfinClientDeviceIdOverride,
					language,
					existingSession,
					rememberedServerUrl,
					debugLoggingEnabled,
				]) => {
					if (this.isDestroyed()) return;
					this.jellyfinClientDeviceIdOverride = this.normalizeJellyfinClientDeviceIdOverride(
						jellyfinClientDeviceIdOverride,
					);
					this.authService.setClientDeviceId(this.getEffectiveJellyfinClientDeviceId());
					this.authService.setMockMode(mode === ConnectionModes.mock);
					try {
						setAtollaImageLoaderDiskCacheMaxBytes(imageCacheMaxBytes);
					} catch {
						// Native disk cache unavailable on non-Android targets.
					}
					if (mode === ConnectionModes.online && existingSession != null) {
						this.currentAccessToken = existingSession.accessToken;
						this.transport = new LiveTransport(
							existingSession.serverUrl,
							existingSession.accessToken,
							existingSession.userId,
							{
								clientDeviceId: this.getEffectiveJellyfinClientDeviceId(),
							},
						);
					} else if (mode === ConnectionModes.mock) {
						this.transport = new MockTransport();
					} else {
						this.transport = new OfflineTransport(
							this.downloadService,
							this.playlistCreateService,
							this.playlistEditService,
						);
					}

					const isAuthRequired = mode === ConnectionModes.online && existingSession == null;
					const userId = existingSession != null ? existingSession.userId : 'shared';
					this.initUserStores(userId);

					if (language !== DEFAULT_LANGUAGE) {
						overrideLocales(Strings, () => [new Locale(language, undefined)]);
					}
					DebugLogger.setEnabled(debugLoggingEnabled);
					this.markSessionStartAndDetectPriorCrash();
					this.setState({
						debugLogFilePath: DebugLogger.getLogFilePath() || null,
						debugLoggingEnabled,
					});
					this.completeBootstrap({
						animationsEnabled,
						authErrorMessage: null,
						connectionMode: mode,
						gridColumns,
						imageCacheMaxBytes,
						isAuthRequired,
						jellyfinClientDeviceIdOverride: this.jellyfinClientDeviceIdOverride,
						language,
						serverName: existingSession != null ? existingSession.serverName : '',
						serverUrlPrefill: rememberedServerUrl,
						trackCacheMaxTracks,
					});
					this.applyNativeTrackCacheLimit(trackCacheMaxTracks);
				},
			)
			.catch(() => {
				if (this.isDestroyed() || this.state.isBootstrapped) return;
				this.initUserStores('shared');
				this.transport = new OfflineTransport(
					this.downloadService,
					this.playlistCreateService,
					this.playlistEditService,
				);
				this.completeBootstrap({ connectionMode: ConnectionModes.offline });
			});
		this.downloadService.subscribe(() => {
			this.setState({
				downloadedSizeBytes: this.downloadService.getTotalDownloadedSizeBytes(),
				downloadedTrackCount: this.downloadService.getDownloadedTrackCount(),
				downloadingCount: this.downloadService.getDownloadingCount(),
			});
		});
		this.downloadService.onAppReady();
		this.unsubscribePlayback = this.playbackStore.subscribe(() => {
			// Always run progress-sensitive work — these are cheap and need every tick.
			this.syncScrobblePlaybackSnapshot();
			this.syncTrackPlaybackNotification();

			// Gate everything else (and the re-render) behind a structural signature.
			// The visible progress bar is driven by ref-based subscriptions and doesn't need a full re-render.
			// If more than 1s has passed since the last tick, the app was backgrounded — reset the
			// signature so the first tick after foregrounding re-runs all handlers (palette, overlay, etc.).
			const now = Date.now();
			if (this.lastPlaybackTickAt > 0 && now - this.lastPlaybackTickAt > 1000) {
				this.lastPlaybackSignature = '';
			}
			this.lastPlaybackTickAt = now;

			const { track, trackIndex, tracks, album, isPlaying, loopMode } = this.playbackStore;
			const sig = `${track?.id ?? ''}|${trackIndex}|${tracks.length}|${album?.id ?? ''}|${isPlaying}|${loopMode}`;
			if (sig === this.lastPlaybackSignature) return;
			this.lastPlaybackSignature = sig;

			this.handleAlbumChange();
			if (!this.handleTrackPlaybackSourceChange()) {
				this.handleNextTrackPreload();
			}
			this.syncUpcomingQueue();
			this.handleTrackPrefetchQueueChange();
			this.captureRecentlyPlayedTrack();
			this.handleWaveformPriority();
			this.resolveCurrentArtistLogo();
			this.nowPlayingOverlaySlot.slotted(this.renderNowPlayingOverlay);
			this.setState({ version: this.state.version + 1 });
		});
		this.syncScrobblePlaybackSnapshot();
		// Handle any track already playing at startup
		this.handleAlbumChange();
		if (!this.handleTrackPlaybackSourceChange()) {
			this.handleNextTrackPreload();
		}
		this.syncUpcomingQueue();
		this.handleTrackPrefetchQueueChange();
		this.captureRecentlyPlayedTrack();
		this.resolveCurrentArtistLogo();
		this.syncTrackPlaybackNotification();
		this.refreshTrackCachedCount();
	}

	private captureRecentlyPlayedTrack(): void {
		const activeTrack = this.playbackStore.track;
		if (!activeTrack) {
			this.lastObservedRecentTrackId = null;
			return;
		}

		if (activeTrack.id === this.lastObservedRecentTrackId) {
			return;
		}

		this.lastObservedRecentTrackId = activeTrack.id;
		this.recentlyPlayedTracks = [
			activeTrack,
			...this.recentlyPlayedTracks.filter((track) => track.id !== activeTrack.id),
		].slice(0, 5);
		if (!this.recentlyPlayedRestoring) {
			this.persistRecentlyPlayedTracks();
		}
	}

	private persistRecentlyPlayedTracks(): void {
		if (!this.recentlyPlayedStore) {
			return;
		}

		void this.recentlyPlayedStore
			.storeString(RECENTLY_PLAYED_TRACKS_KEY, JSON.stringify(this.recentlyPlayedTracks))
			.catch(() => {
				// best effort persistence
			});
	}

	private restoreRecentlyPlayedTracks(): void {
		if (!this.recentlyPlayedStore) {
			return;
		}

		const store = this.recentlyPlayedStore;
		void store
			.fetchString(RECENTLY_PLAYED_TRACKS_KEY)
			.then((raw) => {
				if (this.isDestroyed()) return;
				const parsed = JSON.parse(raw);
				if (!Array.isArray(parsed)) {
					this.recentlyPlayedTracks = [];
				} else {
					const restored = sanitizeTracks(
						parsed.filter((track): track is Track => this.isTrack(track)).slice(0, 5),
					);
					this.recentlyPlayedTracks = restored;
				}
				this.recentlyPlayedRestoring = false;
				this.lastObservedRecentTrackId = null;
				this.captureRecentlyPlayedTrack();
				this.setState({ version: this.state.version + 1 });
			})
			.catch(() => {
				if (this.isDestroyed()) return;
				this.recentlyPlayedTracks = [];
				this.recentlyPlayedRestoring = false;
				this.lastObservedRecentTrackId = null;
				this.captureRecentlyPlayedTrack();
				this.setState({ version: this.state.version + 1 });
			});
	}

	private isTrack(value: unknown): value is Track {
		if (!value || typeof value !== 'object') {
			return false;
		}

		const candidate = value as Partial<Track>;
		return (
			typeof candidate.id === 'string' &&
			typeof candidate.name === 'string' &&
			typeof candidate.duration === 'number'
		);
	}

	onDestroy(): void {
		// Clean shutdown: clear the crash sentinel so the next launch doesn't report
		// a false crash. A real crash (or OS task-kill) skips this, leaving it set.
		void this.diagnosticsStore.storeString('session_active', '0').catch(() => {});
		this.playbackStore.persistNow();
		if (this.bootstrapCommitTimer) {
			clearTimeout(this.bootstrapCommitTimer);
		}
		if (this.unsubscribeToast) {
			this.unsubscribeToast();
		}
		if (this.syncBannerTimer) {
			clearTimeout(this.syncBannerTimer);
		}
		if (this.playbackSourceBoundTimeout) {
			clearTimeout(this.playbackSourceBoundTimeout);
		}
		if (this.unsubscribePlayback) {
			this.unsubscribePlayback();
		}
		if (this.unsubscribePalette) {
			this.unsubscribePalette();
		}
		if (this.unsubscribeWaveform) {
			this.unsubscribeWaveform();
		}
		if (this.unsubscribeWaveformRender) {
			this.unsubscribeWaveformRender();
		}
		if (this.waveformQueue) {
			this.waveformQueue.dispose();
		}
		if (this.waveformRenderCache) {
			this.waveformRenderCache.clear();
		}
		if (this.nativeCacheStatsInterval) {
			clearInterval(this.nativeCacheStatsInterval);
		}
		if (this.nativePlaybackActionInterval) {
			clearInterval(this.nativePlaybackActionInterval);
		}
		if (!this.playbackStore.track) {
			clearAtollaTrackPlaybackNotification();
		}
		this.trackPrefetchQueue.clearQueue();
		if (this.paletteQueue) {
			this.paletteQueue.dispose();
		}
		this.downloadWorkerClient.dispose();
	}

	private initUserStores(userId: string): void {
		if (this.unsubscribePalette) {
			this.unsubscribePalette();
		}
		if (this.unsubscribeWaveform) {
			this.unsubscribeWaveform();
		}
		if (this.unsubscribeWaveformRender) {
			this.unsubscribeWaveformRender();
		}
		if (this.waveformQueue) {
			this.waveformQueue.dispose();
		}
		if (this.waveformRenderCache) {
			this.waveformRenderCache.clear();
		}
		this.searchStore = new SearchStore(
			new PersistentStore(`atolla/user/${userId}/search_history`, { deviceGlobal: true }),
		);
		this.recentlyPlayedStore = new PersistentStore(`atolla/user/${userId}/recently_played`, {
			deviceGlobal: true,
		});
		this.nowPlayingQueueStore = new PersistentStore(`atolla/user/${userId}/now_playing_queue`, {
			deviceGlobal: true,
		});
		void this.playbackStore.setQueueStore(
			this.nowPlayingQueueStore,
			() => {
				try {
					return getAtollaAudioPlaybackIsActive();
				} catch {
					return false;
				}
			},
			() => {
				// Hand the restore the engine's live track/position so it lands on the track the
				// engine actually reached in the background rather than the stale persisted one.
				try {
					const trackId = getAtollaAudioPlaybackCurrentTrackId();
					if (!trackId) return null;
					return {
						positionSeconds: Math.max(0, getAtollaAudioPlaybackPositionMs() / 1000),
						trackId,
					};
				} catch {
					return null;
				}
			},
		);
		this.homeAlbumsStore = new PersistentStore(`atolla/user/${userId}/home`, {
			deviceGlobal: true,
		});
		// Purge the legacy whole-library home cache (could be ~1MB+); "On This Day"
		// now keeps only today's/tomorrow's matches via OnThisDayService.
		void (this.homeAlbumsStore as { remove?(key: string): Promise<void> })
			.remove?.('albums_v1')
			.catch(() => {});
		this.onThisDayService = new OnThisDayService(this.homeAlbumsStore);
		// Warm the in-memory cache from disk; HomeView reads it and triggers the
		// background rebuild itself, so display owns its own re-render.
		void this.onThisDayService.ensureLoaded();
		this.recentlyPlayedRestoring = true;
		this.recentlyPlayedTracks = [];
		this.lastObservedRecentTrackId = null;
		this.restoreRecentlyPlayedTracks();
		this.paletteService = new ArtworkPaletteService(
			new WriteBehindPaletteStore(
				new PersistentPaletteStore(
					new PersistentStore(`atolla/user/${userId}/artwork_palettes`, { deviceGlobal: true }),
				),
			),
		);
		this.paletteQueue = new PaletteGenerationQueue(this.paletteService);
		this.scrobbleService = new ScrobbleService({
			deliverScrobble: (pending) => {
				return this.transport.scrobbleTrackPlayed(pending.trackId, pending.triggeredAt);
			},
			store: new PersistentStore(`atolla/user/${userId}/pending_scrobbles`, {
				deviceGlobal: true,
			}),
		});
		this.syncScrobblePlaybackSnapshot();
		void this.scrobbleService.onAppReady();
		this.reconnectSync = new ReconnectSyncCoordinator({
			downloadService: this.downloadService,
			playlistCreateService: this.playlistCreateService,
			playlistEditService: this.playlistEditService,
			scrobbleService: this.scrobbleService,
		});
		try {
			setAtollaImageCachedObserver((url, category) => {
				// Let any in-progress downloads waiting on this image complete.
				this.resolveCachedImageWaiters(url, category);
				if (category !== 'album_art' || this.paletteService.hasPalette(url)) {
					return;
				}
				this.paletteQueue.enqueue(url);
			});
		} catch {
			// Observer bridge unavailable on non-Android targets.
		}
		this.unsubscribePalette = this.paletteService.subscribe(() => {
			this.nowPlayingOverlaySlot.slotted(this.renderNowPlayingOverlay);
			this.setState({ version: this.state.version + 1 });
		});
		this.waveformService = new WaveformService(
			new PersistentWaveformStore(
				new PersistentStore(`atolla/user/${userId}/waveform_data`, { deviceGlobal: true }),
			),
		);
		this.waveformRenderCache = new WaveformRenderCache();
		this.waveformQueue = new WaveformGenerationQueue(this.waveformService);
		void this.waveformService.warmUp();
		this.unsubscribeWaveform = this.waveformService.subscribe(() => {
			this.nowPlayingOverlaySlot.slotted(this.renderNowPlayingOverlay);
			this.setState({ version: this.state.version + 1 });
		});
		this.unsubscribeWaveformRender = this.waveformRenderCache.subscribe(() => {
			this.nowPlayingOverlaySlot.slotted(this.renderNowPlayingOverlay);
			this.setState({ version: this.state.version + 1 });
		});
	}

	private showAuthToast(message: string): void {
		this.toastService.show(message, 2500);
	}

	private showPlaybackToast(message: string): void {
		this.toastService.show(message, 3000);
	}

	private refreshTrackCachedCount(): void {
		const nativeCount = this.getNativeTrackCachedCount();
		if (nativeCount == null || this.state.trackPlaybackCachedCount === nativeCount) {
			return;
		}

		this.setState({ trackPlaybackCachedCount: nativeCount });
	}

	private async validateSessionInBackground(session: AuthSession): Promise<void> {
		const isValid = await this.authService.validateSession(session);
		if (isValid) {
			return;
		}

		await this.authService.clearSession();
		await this.preferences.setMode(ConnectionModes.offline);
		this.setState({
			authErrorMessage: null,
			isAuthRequired: false,
			quickConnectCode: null,
		});
		this.showAuthToast(AuthErrors.SESSION_EXPIRED.msg());
	}

	handleConnect = (serverUrl: string): void => {
		if (serverUrl.trim().toLowerCase() === 'mock') {
			void (async () => {
				await this.preferences.setMode(ConnectionModes.mock);
				this.authService.setMockMode(true);
				this.transport = new MockTransport();
				this.setState({
					authErrorMessage: null,
					connectionMode: ConnectionModes.mock,
					isAuthenticating: false,
					isAuthRequired: false,
					quickConnectCode: null,
				});
			})();
			return;
		}

		void (async () => {
			this.authService.setMockMode(false);
			this.setState({
				authErrorMessage: null,
				connectionMode: ConnectionModes.online,
				isAuthenticating: true,
				quickConnectCode: null,
				serverUrlPrefill: serverUrl,
			});

			try {
				await this.preferences.setMode(ConnectionModes.online);
				await this.authService.rememberServerUrl(serverUrl);

				const quickConnect = await this.authService.startQuickConnect(serverUrl);
				this.setState({ quickConnectCode: quickConnect.code });

				await this.authService.waitForQuickConnectApproval(serverUrl, quickConnect.secret, 60_000);
				const session = await this.authService.authenticateWithQuickConnect(
					serverUrl,
					quickConnect.secret,
				);
				await this.authService.saveSession(session);

				this.currentAccessToken = session.accessToken;
				this.transport = new LiveTransport(session.serverUrl, session.accessToken, session.userId, {
					clientDeviceId: this.getEffectiveJellyfinClientDeviceId(),
				});
				this.initUserStores(session.userId);

				this.setState({
					authErrorMessage: null,
					connectionMode: ConnectionModes.online,
					isAuthenticating: false,
					isAuthRequired: false,
					quickConnectCode: null,
					serverName: session.serverName,
				});
				this.showAuthToast('connected');

				try {
					await this.authService.probeInitialAlbums(session);
				} catch {
					this.showAuthToast(AuthErrors.FAILED_TO_FETCH_DATA.msg());
				}

				void this.validateSessionInBackground(session);
			} catch (error) {
				this.setState({
					authErrorMessage: this.authService.errorMessage(error),
					connectionMode: ConnectionModes.online,
					isAuthenticating: false,
					isAuthRequired: true,
					quickConnectCode: null,
					serverUrlPrefill: serverUrl,
				});
			} finally {
				if (this.state.isAuthenticating) {
					this.setState({ isAuthenticating: false });
				}
			}
		})();
	};

	private requestModeChange = async (mode: ConnectionMode): Promise<boolean> => {
		// Breadcrumbs trace the offline<->online toggle: the last one written before
		// a crash localizes where the process died (paired with the crash sentinel).
		DebugLogger.log('mode', 'requestModeChange begin', { mode });
		try {
			this.pendingNavRestoreContext = this.currentLibraryNavContext;
			await this.preferences.setMode(mode);
			this.authService.setMockMode(mode === ConnectionModes.mock);

			if (mode === ConnectionModes.online) {
				const session = await this.authService.loadSession();
				DebugLogger.log('mode', 'session loaded', { hasSession: session != null });
				if (session != null) {
					this.currentAccessToken = session.accessToken;
					this.transport = new LiveTransport(
						session.serverUrl,
						session.accessToken,
						session.userId,
						{
							clientDeviceId: this.getEffectiveJellyfinClientDeviceId(),
						},
					);
					DebugLogger.log('mode', 'live transport ready, applying state');
					this.setState({ connectionMode: mode, isAuthRequired: false });
					this.startReconnectSync();
					return true;
				}

				this.setState({ connectionMode: mode, isAuthRequired: true });
				return true;
			}

			if (mode === ConnectionModes.offline) {
				this.transport = new OfflineTransport(
					this.downloadService,
					this.playlistCreateService,
					this.playlistEditService,
				);
			} else {
				this.transport = new MockTransport();
			}

			DebugLogger.log('mode', 'offline/mock transport ready, applying state', { mode });
			this.setState({ connectionMode: mode, isAuthRequired: false });
			return true;
		} catch (error) {
			DebugLogger.log('mode', 'requestModeChange failed', {
				message: error instanceof Error ? error.message : String(error),
			});
			return false;
		}
	};

	handleModeChange = (mode: ConnectionMode): void => {
		void this.requestModeChange(mode);
	};

	// Flush queued work (playlist edits/creates, scrobbles) and resume downloads
	// after reconnecting, reporting progress to the banner. The coordinator never
	// rejects, and the whole chain is guarded so this can never crash the toggle.
	private startReconnectSync(): void {
		DebugLogger.log('mode', 'startReconnectSync');
		const coordinator = this.reconnectSync;
		if (!coordinator) return;
		const transport = this.transport;
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

	private handleSyncBannerTap = (): void => {
		if (this.syncBannerTimer) {
			clearTimeout(this.syncBannerTimer);
			this.syncBannerTimer = undefined;
		}
		this.setState({ syncProgress: null });
		const errors = this.lastSyncEditErrors;
		if (errors.length === 0) return;
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

	// Logs and swallows a rejection from a deliberately detached promise so it can
	// never surface as an unhandled rejection (which crashes the app).
	private handleSwallowedAsyncError = (error: unknown): void => {
		DebugLogger.log('async', 'swallowed async error', {
			message: error instanceof Error ? error.message : String(error),
		});
	};

	// Best-effort global backstop: catch any unhandled rejection the per-call
	// guards miss. The runtime may not expose this hook, so it is feature-detected
	// and is a safety net, not the primary defense.
	private installGlobalRejectionHandler(): void {
		try {
			const globalScope = globalThis as unknown as {
				addEventListener?: (type: string, handler: (event: unknown) => void) => void;
				onunhandledrejection?: ((event: unknown) => void) | null;
			};
			const handler = (event: unknown): void => {
				const reason = (event as { reason?: unknown })?.reason ?? event;
				this.handleSwallowedAsyncError(reason);
				try {
					(event as { preventDefault?: () => void })?.preventDefault?.();
				} catch {
					// preventDefault not supported — logging already done.
				}
			};
			if (typeof globalScope.addEventListener === 'function') {
				globalScope.addEventListener('unhandledrejection', handler);
			} else {
				globalScope.onunhandledrejection = handler;
			}
		} catch {
			// Runtime does not support a global rejection hook — per-call guards cover us.
		}
	}

	// Best-effort backstop for synchronous uncaught JS errors, mirroring the
	// rejection hook. A crash record only reaches the exported log if debug
	// logging is on; native crashes (SIGSEGV) bypass JS entirely and are instead
	// surfaced by the unclean-shutdown sentinel below.
	private installGlobalErrorHandler(): void {
		try {
			const globalScope = globalThis as unknown as {
				addEventListener?: (type: string, handler: (event: unknown) => void) => void;
				onerror?: ((...args: Array<unknown>) => void) | null;
			};
			const handler = (raw: unknown): void => {
				const error =
					(raw as { error?: unknown })?.error ?? (raw as { message?: unknown })?.message ?? raw;
				DebugLogger.log('crash', 'uncaught error', {
					message: error instanceof Error ? error.message : String(error),
					stack: error instanceof Error ? error.stack : undefined,
				});
			};
			if (typeof globalScope.addEventListener === 'function') {
				globalScope.addEventListener('error', handler);
			} else {
				// Classic onerror signature is (message, source, lineno, colno, error).
				globalScope.onerror = (...args: Array<unknown>) => handler(args[4] ?? args[0]);
			}
		} catch {
			// Runtime does not support a global error hook — per-call guards cover us.
		}
	}

	// Detects a previous session that ended without a clean onDestroy (a crash or
	// OS task-kill) using a persisted sentinel, then re-arms it for this session.
	// This is the only signal that surfaces a native SIGSEGV, which no JS or
	// managed-exception handler can catch.
	private markSessionStartAndDetectPriorCrash(): void {
		void this.diagnosticsStore
			.fetchString('session_active')
			.then((value) => {
				if (value === '1') {
					DebugLogger.log('crash', 'previous session ended without clean shutdown');
				}
				return this.diagnosticsStore.storeString('session_active', '1');
			})
			.catch(() => {});
	}

	handleLogout = (): void => {
		void (async () => {
			try {
				await this.authService.clearSession();
			} catch {
				// best effort — clear what we can
			}
			this.currentAccessToken = '';
			this.transport = new OfflineTransport(
				this.downloadService,
				this.playlistCreateService,
				this.playlistEditService,
			);
			this.playbackStore.stop();
			this.recentlyPlayedTracks = [];
			this.lastObservedRecentTrackId = null;
			this.setState({
				authErrorMessage: null,
				connectionMode: ConnectionModes.online,
				isAuthenticating: false,
				isAuthRequired: true,
				quickConnectCode: null,
				serverName: '',
				serverUrlPrefill: '',
				version: this.state.version + 1,
			});
			this.showAuthToast('logged out');
		})();
	};

	private refreshNativeCacheStats(): void {
		try {
			// The scan walks the whole image disk cache, so it runs on a native background thread and
			// delivers results via this callback — never blocking the JS thread (which would stutter
			// concurrent animations such as the now-playing surface collapse).
			requestAtollaImageLoaderDiskCacheStats(
				(nativeImageCacheDiskCount, nativeImageCacheDiskBytes, categoryCountsJson) => {
					let imageCategoryCounts: Record<string, number> = this.state.imageCategoryCounts;
					try {
						imageCategoryCounts = JSON.parse(categoryCountsJson) as Record<string, number>;
					} catch {
						// Leave existing counts on parse failure.
					}
					this.setState({
						imageCategoryCounts,
						nativeImageCacheDiskBytes,
						nativeImageCacheDiskCount,
					});
				},
			);
		} catch {
			// Native cache stats unavailable on non-Android targets.
		}
	}

	// Called whenever the playback store changes. Loads the persisted palette
	// immediately (warmUp) and prefetches the image for display. If no persisted
	// When the playing track changes, warm up any persisted palette and queue generation if needed.
	private handleAlbumChange(): void {
		if (!this.paletteService) return;
		const imageUrl =
			this.playbackStore.track?.albumImageUrl ?? this.playbackStore.album?.imageUrl ?? null;
		if (!imageUrl || imageUrl === this.lastArtworkUrl) return;
		this.lastArtworkUrl = imageUrl;
		this.prewarmNowPlayingArtwork(imageUrl);
		void this.paletteService
			.warmUp([imageUrl])
			.then(() => {
				if (!this.paletteService.hasPalette(imageUrl)) {
					this.paletteQueue.prioritize(imageUrl);
				}
			})
			.catch(this.handleSwallowedAsyncError);
	}

	// The artist logo is resolved from the track's artistId, never stored on the
	// track itself, so any queue path that makes a track current without a logo
	// (add-to-queue, restore, etc.) leaves it missing. Resolve it lazily here so
	// every path is covered in one place rather than at each queue mutation.
	private resolveCurrentArtistLogo(): void {
		const artistId = this.playbackStore.unresolvedArtistLogoArtistId;
		if (!artistId || this.resolvingArtistLogoId === artistId) return;

		this.resolvingArtistLogoId = artistId;
		void this.transport
			.getArtistLogoUrl(artistId)
			.then((logoUrl) => {
				this.resolvingArtistLogoId = null;
				if (!logoUrl) return;
				// Bail if the current track changed (or already got a logo) while resolving.
				if (this.playbackStore.unresolvedArtistLogoArtistId !== artistId) return;
				this.playbackStore.setArtistLogoUrl(logoUrl);
				// setArtistLogoUrl notifies, but the playback subscription bails on an
				// unchanged signature, so re-slot the overlay explicitly the way the
				// palette and waveform subscriptions do.
				this.nowPlayingOverlaySlot.slotted(this.renderNowPlayingOverlay);
				this.setState({ version: this.state.version + 1 });
			})
			.catch(() => {
				this.resolvingArtistLogoId = null;
			});
	}

	private prewarmNowPlayingArtwork(imageUrl: string): void {
		const outputType = Device.isAndroid()
			? AssetOutputType.IMAGE_ANDROID
			: AssetOutputType.IMAGE_IOS;
		const sources = [
			buildImageSource(imageUrl, 'album_art'),
			buildImageSource(imageUrl, 'album_art_blurred'),
		];

		for (const source of sources) {
			let subscription: { unsubscribe(): void } | undefined;
			subscription = addAssetLoadObserver(
				source,
				() => {
					subscription?.unsubscribe();
				},
				outputType,
			);
		}
	}

	private getPlaybackTrackIds(): Array<string> {
		const { tracks, trackIndex } = this.playbackStore;
		const ids: Array<string> = [];
		for (let i = trackIndex; i < tracks.length; i++) ids.push(tracks[i].id);
		for (let i = 0; i < trackIndex; i++) ids.push(tracks[i].id);
		return ids;
	}

	private handleWaveformPriority(): void {
		if (!this.waveformQueue || !this.waveformService || this.playbackStore.tracks.length === 0)
			return;

		// Skip if neither the track list nor the active index changed — native
		// bridge calls for every track are expensive and this fires on every
		// progress tick.
		if (
			this.playbackStore.tracks === this.lastWaveformPriorityTracksRef &&
			this.playbackStore.trackIndex === this.lastWaveformPriorityTrackIndex
		) {
			return;
		}
		this.lastWaveformPriorityTracksRef = this.playbackStore.tracks;
		this.lastWaveformPriorityTrackIndex = this.playbackStore.trackIndex;

		// Enqueue any playback-queue track that doesn't have a waveform yet.
		// This covers failed tracks (retry) and downloaded tracks whose generation
		// never started because they weren't the active track at download time.
		for (const track of this.playbackStore.tracks) {
			const audioPath = this.getAudioPathForWaveform(track.id);
			if (audioPath) {
				this.waveformService.scheduleGeneration(track.id);
				this.waveformQueue.enqueue(track.id, audioPath);
			}
		}
		this.waveformQueue.reorderToMatch(this.getPlaybackTrackIds());
	}

	// -------------------------------------------------------------------------
	// Offline image caching bridge (native, best-effort)
	// -------------------------------------------------------------------------

	/**
	 * Identity used to match a cache request against the native "image cached"
	 * observer. The url we hand to the native loader carries `api_key` (needed for
	 * the fetch) while the observer reports the stripped url, and query encoding can
	 * differ between the two — so we match on the stable parts only: category, path,
	 * and the Jellyfin image `tag`. Non-Jellyfin urls fall back to path identity.
	 */
	private imageFingerprint(url: string, category: string): string {
		try {
			const parsed = new URL(url);
			const tag = parsed.searchParams.get('tag') ?? '';
			return `${category}\n${parsed.origin}${parsed.pathname}\n${tag}`;
		} catch {
			return `${category}\n${url}`;
		}
	}

	/**
	 * Ask the native loader to ensure an image is cached, resolving once it reports
	 * the asset cached via the observer. The native loader fetches only when the
	 * asset is missing and reports cached for hits too, so this resolves promptly
	 * whether the image was already present or freshly downloaded. As a safety net
	 * (e.g. the observer never fires) a bounded timeout resolves anyway — the asset
	 * has either been cached or is fetched again on demand, so the download counter
	 * never wedges.
	 */
	private cacheImageAsset(url: string, category: ImageCategory): Promise<void> {
		return new Promise<void>((resolve) => {
			const key = this.imageFingerprint(url, category);
			let settled = false;
			let timer: ReturnType<typeof setTimeout> | undefined;

			const done = (): void => {
				if (settled) return;
				settled = true;
				if (timer) clearTimeout(timer);
				const list = this.pendingImageCacheResolvers.get(key);
				if (list) {
					const index = list.indexOf(done);
					if (index >= 0) list.splice(index, 1);
					if (list.length === 0) this.pendingImageCacheResolvers.delete(key);
				}
				resolve();
			};

			const list = this.pendingImageCacheResolvers.get(key) ?? [];
			list.push(done);
			this.pendingImageCacheResolvers.set(key, list);

			try {
				preloadAtollaImages([url], category);
			} catch {
				// No native preload bridge on this platform — treat as done so the
				// counter never wedges; the image is fetched on demand when shown.
				done();
				return;
			}

			timer = setTimeout(done, IMAGE_CACHE_RESOLVE_TIMEOUT_MS);
		});
	}

	/** Resolve any downloads waiting on an image the native loader just cached. */
	private resolveCachedImageWaiters(url: string, category: string): void {
		const key = this.imageFingerprint(url, category);
		const resolvers = this.pendingImageCacheResolvers.get(key);
		if (!resolvers || resolvers.length === 0) return;
		for (const resolve of [...resolvers]) {
			resolve();
		}
	}

	private handleTrackCached(trackId: string): void {
		this.lastTrackFetchErrorTrackId = null;
		this.refreshTrackCachedCount();

		const audioPath = this.getAudioPathForWaveform(trackId);
		if (audioPath && this.waveformService && this.waveformQueue) {
			this.waveformService.scheduleGeneration(trackId);
			this.waveformQueue.enqueue(trackId, audioPath);
			// Re-sort immediately so this entry lands in playback order rather than
			// waiting for the next playback store event.
			this.waveformQueue.reorderToMatch(this.getPlaybackTrackIds());
		}

		if (this.playbackStore.track?.id !== trackId) {
			this.handleNextTrackPreload();
			this.syncUpcomingQueue();
			return;
		}

		if (!this.handleTrackPlaybackSourceChange(true)) {
			this.handleNextTrackPreload();
		}
		this.syncUpcomingQueue();
	}

	private getWaveformMaskUrl(trackId: string): string | null {
		if (!this.waveformService || !this.waveformRenderCache) return null;
		const amps = this.waveformService.getAmps(trackId);
		if (!amps) return null;
		return this.waveformRenderCache.getOrRequest(trackId, amps);
	}

	private getAudioPathForWaveform(trackId: string): string | null {
		try {
			const cached = getAtollaCachedTrackFileUrl(trackId);
			if (cached) return cached;
		} catch {}
		try {
			const downloaded = getAtollaDownloadedTrackFileUrl(trackId);
			if (downloaded) return downloaded;
		} catch {}
		return null;
	}

	private handleTrackCacheFetchFailed(trackId: string, reason = 'unknown'): void {
		if (this.playbackStore.track?.id !== trackId) {
			return;
		}

		if (this.isOfflinePlaybackMode()) {
			return;
		}

		if (this.lastTrackFetchErrorTrackId === trackId) {
			return;
		}

		this.lastTrackFetchErrorTrackId = trackId;
		this.showPlaybackToast(`cache failed: ${reason}`);
	}

	// Returns true when it has already applied the gapless "next" source (via
	// applyPlaybackSources) so callers can skip a redundant handleNextTrackPreload() — the
	// next source is otherwise recomputed (and re-read from the native cache) for nothing.
	private handleTrackPlaybackSourceChange(force = false): boolean {
		const activeTrack = this.playbackStore.track;

		if (!activeTrack) {
			this.playbackSourceRequestId += 1;
			this.lastTrackSourceTrackId = null;
			if (this.state.trackPlaybackSourceUrl != null) {
				this.setState({ trackPlaybackSourceUrl: null });
			}
			return false;
		}

		if (!force && this.lastTrackSourceTrackId === activeTrack.id) {
			const shouldRetryForMissingSource =
				this.playbackStore.isPlaying && this.state.trackPlaybackSourceUrl == null;
			if (!shouldRetryForMissingSource) {
				return false;
			}
		}

		this.lastTrackSourceTrackId = activeTrack.id;
		const requestId = this.playbackSourceRequestId + 1;
		this.playbackSourceRequestId = requestId;
		const nativeSource = this.getNativeCachedTrackSource(activeTrack.id);
		if (nativeSource) {
			let appliedNext = false;
			if (this.state.trackPlaybackSourceUrl !== nativeSource) {
				this.applyPlaybackSources(nativeSource);
				appliedNext = true;
			}
			// Local file available — start waveform generation immediately without
			// waiting for handleTrackCached (covers already-cached and downloaded tracks).
			this.enqueueWaveformIfNeeded(activeTrack.id, nativeSource);
			return appliedNext;
		}

		const streamUrl = this.getTrackStreamSource(activeTrack.id);
		let appliedNext = false;
		if (streamUrl && this.state.trackPlaybackSourceUrl !== streamUrl) {
			this.applyPlaybackSources(streamUrl);
			appliedNext = true;
		}

		if (this.playbackStore.isPlaying && !this.isOfflinePlaybackMode()) {
			void this.downloadCurrentTrackForPlayback(activeTrack.id, requestId, streamUrl);
			// Start waveform generation from the stream URL in parallel with the
			// download so the waveform is ready as soon as possible.
			if (streamUrl) {
				this.enqueueWaveformIfNeeded(activeTrack.id, streamUrl);
			}
		}

		return appliedNext;
	}

	private enqueueWaveformIfNeeded(trackId: string, audioPath: string): void {
		if (!this.waveformService || !this.waveformQueue) return;
		this.waveformService.scheduleGeneration(trackId);
		this.waveformQueue.enqueue(trackId, audioPath);
		this.waveformQueue.reorderToMatch(this.getPlaybackTrackIds());
	}

	private isOfflinePlaybackMode(): boolean {
		return this.state.connectionMode === ConnectionModes.offline;
	}

	private handleTrackCompleted = (): void => {
		const track = this.playbackStore.track;
		if (track) {
			this.playbackStore.updateProgress(track.duration);
		}
	};

	private computeNextTrackSource(): string | null {
		const { loopMode, trackIndex, tracks } = this.playbackStore;
		let nextIndex = trackIndex + 1;
		if (nextIndex >= tracks.length) {
			if (loopMode === 'queue' && tracks.length > 0) {
				nextIndex = 0;
			} else {
				return null;
			}
		}
		const nextTrack = tracks[nextIndex];
		return nextTrack
			? (this.getNativeCachedTrackSource(nextTrack.id) ?? this.getTrackStreamSource(nextTrack.id))
			: null;
	}

	// Apply the current source and the gapless "next" source in a single state update.
	// On a track transition the store advances current and next together; updating them in
	// one setState avoids a momentary render where the native player sees the previous
	// "next" (now the current track) and drops the gapless preload. That gap is what lets
	// offline playback reach end-of-queue and stall between tracks.
	private applyPlaybackSources(currentSource: string | null): void {
		const nextSource = this.computeNextTrackSource();
		if (
			this.state.trackPlaybackSourceUrl === currentSource &&
			this.state.nextTrackSourceUrl === nextSource
		) {
			return;
		}
		this.setState({
			nextTrackSourceUrl: nextSource,
			trackPlaybackSourceUrl: currentSource,
		});
	}

	private handleNextTrackPreload(): void {
		const source = this.computeNextTrackSource();
		if (this.state.nextTrackSourceUrl !== source) {
			this.setState({ nextTrackSourceUrl: source });
		}
	}

	// Hands the native engine an ordered window of the play queue around the current track so
	// it can keep auto-advancing forwards (gapless) and stepping backwards (previous button)
	// across multiple track boundaries while the JS runtime is frozen in the background —
	// without this only the single preloaded next item survives backgrounding and playback
	// stops at the following boundary.
	private syncUpcomingQueue(): void {
		const window = buildPlaybackQueueWindow(
			this.playbackStore,
			(trackId) => this.getNativeCachedTrackSource(trackId) ?? this.getTrackStreamSource(trackId),
		);
		const payload = serializeQueueWindow(window);
		if (payload === this.lastUpcomingQueueKey) {
			return;
		}

		this.lastUpcomingQueueKey = payload;
		try {
			setAtollaAudioPlaybackUpcomingQueue(payload);
		} catch {
			// Native module without upcoming queue support (e.g. mock platform builds).
		}
	}

	private handleTrackPrefetchQueueChange(force = false): void {
		const activeTrack = this.playbackStore.track;
		const tracks = this.playbackStore.tracks;
		const trackIndex = this.playbackStore.trackIndex;

		if (!activeTrack || tracks.length === 0) {
			this.lastPrefetchTracksRef = null;
			this.lastPrefetchTrackIndex = -1;
			this.lastPrefetchTransport = this.transport;
			this.trackPrefetchQueue.clearQueue();
			return;
		}

		if (
			!force &&
			tracks === this.lastPrefetchTracksRef &&
			trackIndex === this.lastPrefetchTrackIndex &&
			this.transport === this.lastPrefetchTransport
		) {
			return;
		}

		this.lastPrefetchTracksRef = tracks;
		this.lastPrefetchTrackIndex = trackIndex;
		this.lastPrefetchTransport = this.transport;

		const nextTrackIndex = trackIndex + 1;
		if (nextTrackIndex >= tracks.length) {
			this.trackPrefetchQueue.clearQueue();
			return;
		}

		this.trackPrefetchQueue.replaceQueue(tracks, nextTrackIndex);
	}

	private downloadCurrentTrackForPlayback(
		trackId: string,
		requestId: number,
		resolvedStreamSource: string | null,
	): void {
		if (!trackId || this.inFlightTrackDownloadIds.has(trackId)) {
			return;
		}

		this.inFlightTrackDownloadIds.add(trackId);

		try {
			const url = resolvedStreamSource ?? this.getTrackStreamSource(trackId);
			if (!url) {
				this.handleTrackCacheFetchFailed(trackId, 'no url');
				return;
			}

			cacheAtollaTrackFromUrlAsync(trackId, url, this.currentAccessToken, (rawSource) => {
				const nativeSource = rawSource ? this.normalizePlaybackFileSource(rawSource) : null;
				if (nativeSource) {
					if (requestId !== this.playbackSourceRequestId) {
						return;
					}

					if (this.playbackStore.track?.id !== trackId) {
						return;
					}

					this.handleTrackCached(trackId);
					return;
				}

				this.handleTrackCacheFetchFailed(trackId, 'native cache failed');
			});
			return;
		} catch (error) {
			const rawMessage =
				typeof error === 'string'
					? error
					: error instanceof Error
						? error.message
						: 'unknown error';
			const message = this.summarizeCacheError(rawMessage);
			this.showPlaybackToast(`cache flow exception: ${message}`);
			this.handleTrackCacheFetchFailed(trackId, `exception: ${message}`);
		} finally {
			this.inFlightTrackDownloadIds.delete(trackId);
		}
	}

	private getTrackStreamSource(trackId: string): string | null {
		const url = this.transport.getTrackCacheUrl(trackId);
		if (!url) {
			return null;
		}

		return this.normalizePlaybackFileSource(url);
	}

	private summarizeCacheError(message: string): string {
		if (!message) {
			return 'unknown error';
		}

		const markerIndex = message.indexOf(':');
		if (markerIndex <= 0) {
			return message;
		}

		return message.slice(0, markerIndex);
	}

	private getNativeCachedTrackSource(trackId: string): string | null {
		if (!trackId) {
			return null;
		}

		try {
			const source = getAtollaCachedTrackFileUrl(trackId);
			if (!source) {
				return null;
			}
			return this.normalizePlaybackFileSource(source);
		} catch {
			return null;
		}
	}

	private normalizePlaybackFileSource(source: string): string {
		return source.trim();
	}

	private getNativeTrackCachedCount(): number | null {
		try {
			const count = getAtollaTrackCacheEntryCount();
			if (!Number.isFinite(count) || count < 0) {
				return null;
			}
			return count;
		} catch {
			return null;
		}
	}

	handleFooterTabTap = (tab: FooterTab): void => {
		this.returnToSearchOnDetailClose = false;
		this.setState({
			activeFooterTab: tab,
			isHomeHeaderVisible: false,
			isHomeNavigationMounted: tab === FooterTabs.home ? false : this.state.isHomeNavigationMounted,
			isLibraryHeaderVisible: tab === FooterTabs.library,
			isSettingsMounted: tab === FooterTabs.settings ? false : this.state.isSettingsMounted,
			nowPlayingCollapseSignal: this.state.nowPlayingCollapseSignal + 1,
			searchFocusSignal:
				tab === FooterTabs.search ? this.state.searchFocusSignal + 1 : this.state.searchFocusSignal,
		});

		if (tab === FooterTabs.home) {
			this.homeNavigationNonce += 1;
			const capturedNonce = this.homeNavigationNonce;
			Promise.resolve().then(() => {
				if (this.homeNavigationNonce === capturedNonce) {
					this.setState({ isHomeNavigationMounted: true });
				}
			});
		}

		if (tab === FooterTabs.settings) {
			this.settingsNavigationNonce += 1;
			const capturedNonce = this.settingsNavigationNonce;
			Promise.resolve().then(() => {
				if (this.settingsNavigationNonce === capturedNonce) {
					this.setState({ isSettingsMounted: true });
					this.refreshNativeCacheStats();
				}
			});
		}
	};

	handleLibraryHeaderTabTap = (tab: HeaderTab): void => {
		this.returnToSearchOnDetailClose = false;
		if (tab === this.state.activeLibraryTab) {
			this.setState({
				isLibraryHeaderVisible: true,
				libraryLetterFilter: null,
				libraryResetNonce: this.state.libraryResetNonce + 1,
			});
			return;
		}

		this.setState({
			activeLibraryTab: tab,
			isLibraryHeaderVisible: true,
			libraryLetterFilter: null,
		});
	};

	handleLibraryAlphabetLetterTap = (letter: string | null): void => {
		this.setState({ libraryLetterFilter: letter });
	};

	handleLibraryHeaderVisibilityChange = (isVisible: boolean): void => {
		if (this.state.isLibraryHeaderVisible === isVisible) {
			return;
		}

		this.setState({ isLibraryHeaderVisible: isVisible });
	};

	handleHomeHeaderVisibilityChange = (isVisible: boolean): void => {
		if (this.state.isHomeHeaderVisible === isVisible) {
			return;
		}

		this.setState({ isHomeHeaderVisible: isVisible });
	};

	handleHomeHeaderTabTap = (tab: HeaderTab): void => {
		this.setState({
			activeFooterTab: FooterTabs.library,
			activeLibraryTab: tab,
			isHomeHeaderVisible: false,
			isLibraryHeaderVisible: true,
		});
	};

	handleClearCache = (selection: ClearCacheSelection): void => {
		const categories: Array<string> = [];
		if (selection.albumArt) categories.push('album_art', 'album_art_thumb');
		if (selection.albumArtBlurred) categories.push('album_art_blurred');
		if (selection.artistImage) categories.push('artist_image', 'artist_image_thumb');
		if (selection.artistLogo) categories.push('artist_logo');
		if (selection.genreImage) categories.push('genre_art');
		if (selection.playlistImage) categories.push('playlist_image', 'playlist_image_thumb');
		try {
			clearAtollaNativeCacheCategories(categories);
		} catch {
			// Native clear unavailable on non-Android targets.
		}
		if (selection.tracks) {
			try {
				clearAtollaTrackCache();
			} catch {
				// Native track cache clear unavailable on non-Android targets.
			}
			this.lastTrackFetchErrorTrackId = null;
			this.lastTrackSourceTrackId = null;
			this.lastPrefetchTracksRef = null;
			this.lastPrefetchTrackIndex = -1;
			this.lastPrefetchTransport = null;
			this.playbackSourceRequestId += 1;
			this.setState({ nextTrackSourceUrl: null, trackPlaybackSourceUrl: null });
			this.handleTrackPrefetchQueueChange(true);
		}
		if (selection.albumArt) {
			void this.paletteService?.clearAll();
			try {
				clearAtollaNativeCacheCategories(['album_art_palette']);
			} catch {
				// Native clear unavailable on non-Android targets.
			}
		}
		if (selection.waveformData) {
			this.waveformService?.clearAll();
			this.waveformRenderCache?.clear();
		}
		this.refreshNativeCacheStats();
		this.refreshTrackCachedCount();
		this.setState({ version: this.state.version + 1 });
	};

	handleClearDownloads = (): void => {
		this.downloadService.removeAllDownloads();
	};

	handleCacheSizeChange = (bytes: number): void => {
		this.preferences.setImageCacheMaxBytes(bytes);
		try {
			setAtollaImageLoaderDiskCacheMaxBytes(bytes);
		} catch {
			// Native disk cache unavailable on non-Android targets.
		}
		this.setState({ imageCacheMaxBytes: bytes });
	};

	handleAnimationsChange = (enabled: boolean): void => {
		this.preferences.setAnimationsEnabled(enabled);
		this.setState({ animationsEnabled: enabled });
	};

	handleDebugLoggingChange = (enabled: boolean): void => {
		void this.preferences.setDebugLoggingEnabled(enabled);
		DebugLogger.setEnabled(enabled);
		this.setState({ debugLoggingEnabled: enabled });
	};

	handleClearDebugLog = (): void => {
		DebugLogger.clearLog();
	};

	handleExportDebugLog = (): void => {
		const dest = DebugLogger.exportLog();
		this.setState({ debugExportPath: dest || null });
	};

	handleExportOfflineStatus = async (): Promise<void> => {
		try {
			const fetchRaw = (
				store: { fetchString(key: string): Promise<string> } | undefined,
				key: string,
			): Promise<string | undefined> =>
				store ? store.fetchString(key).catch(() => undefined) : Promise.resolve(undefined);

			// Home cache keys: 'on_this_day_v1' is OnThisDayService's date-keyed cache
			// (replaced the old whole-library 'albums_v1' blob), 'recently_added_v1'
			// mirrors HomeView's recently-added cache; 'queue' mirrors PlaybackStore.
			const [recentlyPlayed, nowPlayingQueue, homeAlbums, homeRecentlyAdded, playlistEdits] =
				await Promise.all([
					fetchRaw(this.recentlyPlayedStore, RECENTLY_PLAYED_TRACKS_KEY),
					fetchRaw(this.nowPlayingQueueStore, 'queue'),
					fetchRaw(this.homeAlbumsStore, 'on_this_day_v1'),
					fetchRaw(this.homeAlbumsStore, 'recently_added_v1'),
					this.playlistEditService.getPendingCount().catch(() => undefined),
				]);

			const report = buildOfflineDiagnosticsReport({
				appVersion: version,
				connectionMode: this.state.connectionMode,
				debugLoggingEnabled: this.state.debugLoggingEnabled,
				downloads: this.downloadService,
				generatedAt: new Date().toISOString(),
				pending: {
					playlistCreates: this.playlistCreateService.getPending().length,
					playlistEdits,
					scrobbles: this.scrobbleService?.getPendingScrobbles().length,
				},
				platform: Device.isAndroid() ? 'android' : 'ios',
				rawPersisted: { homeAlbums, homeRecentlyAdded, nowPlayingQueue, recentlyPlayed },
				settings: {
					gridColumns: this.state.gridColumns,
					imageCacheMaxBytes: this.state.imageCacheMaxBytes,
					trackCacheMaxTracks: this.state.trackCacheMaxTracks,
				},
				totalDownloadedSizeBytes: this.downloadService.getTotalDownloadedSizeBytes(),
			});

			const json = serializeOfflineDiagnostics(report);
			const fileName = 'atolla-offline-status.json';
			const dest = DebugLogger.exportTextFile(fileName, json);
			this.setState({ offlineStatusExportPath: dest || null });
			DebugLogger.shareTextFile(fileName, json);
		} catch (error) {
			DebugLogger.log('diagnostics', 'offline status export failed', {
				message: error instanceof Error ? error.message : String(error),
			});
		}
	};

	handleShareDebugLog = (): void => {
		DebugLogger.shareLog();
	};

	handleTrackCacheMaxTracksChange = (count: number): void => {
		this.preferences.setTrackCacheMaxTracks(count);
		this.setState({ trackCacheMaxTracks: count });
		this.applyNativeTrackCacheLimit(count);
		this.refreshTrackCachedCount();
	};

	handleGridColumnsChange = (count: number): void => {
		this.preferences.setGridColumns(count);
		this.setState({ gridColumns: count });
	};

	handleLanguageChange = (code: LanguageCode): void => {
		void this.preferences.setLanguage(code);
		overrideLocales(Strings, () => [new Locale(code, undefined)]);
		this.setState({ language: code });
	};

	handleJellyfinClientDeviceIdOverrideChange = (value: string): void => {
		void (async () => {
			const normalized = this.normalizeJellyfinClientDeviceIdOverride(value);
			this.jellyfinClientDeviceIdOverride = normalized;
			this.setState({ jellyfinClientDeviceIdOverride: normalized });

			await this.preferences.setJellyfinClientDeviceIdOverride(normalized);
			this.authService.setClientDeviceId(this.getEffectiveJellyfinClientDeviceId());

			if (this.state.connectionMode === ConnectionModes.online) {
				const session = await this.authService.loadSession();
				if (session != null) {
					this.currentAccessToken = session.accessToken;
					this.transport = new LiveTransport(
						session.serverUrl,
						session.accessToken,
						session.userId,
						{
							clientDeviceId: this.getEffectiveJellyfinClientDeviceId(),
						},
					);
				}
			}
		})();
	};

	private applyNativeTrackCacheLimit(maxTracks: number): void {
		if (!Number.isFinite(maxTracks) || maxTracks <= 0) {
			return;
		}

		try {
			setAtollaTrackCacheMaxTracks(maxTracks);
		} catch {
			// Native track cache limit unavailable on non-Android targets.
		}
	}

	handlePlaybackError = (error: string): void => {
		const normalized = error?.trim() ?? '';

		this.showPlaybackToast(
			normalized.length > 0 ? `playback error: ${normalized}` : 'playback error',
		);
	};

	handlePlaybackEvent = (event: string): void => {
		if (!event) {
			return;
		}

		const trackId = this.playbackStore.track?.id ?? 'none';
		const source = this.state.trackPlaybackSourceUrl ?? 'none';
		const eventKey = `${event}|${trackId}|${source}`;
		if (this.lastPlaybackEventKey === eventKey) {
			return;
		}

		this.lastPlaybackEventKey = eventKey;

		if (event === 'loaded' || event === 'progress') {
			this.playbackReadySource = source;
			if (this.playbackSourceBoundTimeout) {
				clearTimeout(this.playbackSourceBoundTimeout);
				this.playbackSourceBoundTimeout = undefined;
			}
		}

		if (event === 'source-bound') {
			if (this.playbackSourceBoundTimeout) {
				clearTimeout(this.playbackSourceBoundTimeout);
			}

			const retryKey = `${trackId}|${source}`;
			this.playbackSourceBoundTimeout = setTimeout(() => {
				if (this.state.trackPlaybackSourceUrl !== source) {
					return;
				}

				if (this.playbackReadySource === source) {
					return;
				}

				if (this.playbackSourceRetryKeys.has(retryKey)) {
					return;
				}

				const alternateSource = this.toggleLocalFileSourceFormat(source);
				if (!alternateSource || alternateSource === source) {
					return;
				}

				this.playbackSourceRetryKeys.add(retryKey);
				this.setState({ trackPlaybackSourceUrl: alternateSource });
			}, 1200);
		}
	};

	private toggleLocalFileSourceFormat(source: string): string {
		const trimmed = source.trim();
		if (!trimmed) {
			return trimmed;
		}

		if (trimmed.startsWith('file://')) {
			return trimmed.slice('file://'.length);
		}

		if (trimmed.startsWith('/')) {
			return `file://${trimmed}`;
		}

		return trimmed;
	}

	handleLibraryNavigationControllerChange = (navigationController: NavigationController): void => {
		this.libraryNavigationController = navigationController;
		this.tryNavigatePendingArtist();
		this.tryNavigatePendingAlbum();
		this.tryNavigatePendingSearchResult();
		this.tryRestoreNavContext();
	};

	handleHomeNavigationControllerChange = (navigationController: NavigationController): void => {
		this.homeNavigationController = navigationController;
		this.tryNavigatePendingPlaylist();
	};

	handleNavigationContext = (context: LibraryNavContext | null): void => {
		this.currentLibraryNavContext = context;
	};

	private isSameLibraryNavContext(
		left: LibraryNavContext | null,
		right: LibraryNavContext | null,
	): boolean {
		if (!left || !right || left.kind !== right.kind) {
			return false;
		}

		switch (left.kind) {
			case 'artist': {
				return right.kind === 'artist' && left.artist.id === right.artist.id;
			}
			case 'album': {
				return right.kind === 'album' && left.album.id === right.album.id;
			}
			case 'playlist': {
				return right.kind === 'playlist' && left.playlist.id === right.playlist.id;
			}
			case 'genre': {
				return right.kind === 'genre' && left.genre.id === right.genre.id;
			}
		}
	}

	private tryRestoreNavContext(): void {
		const context = this.pendingNavRestoreContext;
		if (!context || !this.libraryNavigationController) {
			return;
		}

		if (this.isSameLibraryNavContext(this.currentLibraryNavContext, context)) {
			this.pendingNavRestoreContext = null;
			return;
		}
		this.pendingNavRestoreContext = null;

		const nav = this.libraryNavigationController;
		const { animationsEnabled, gridColumns } = this.state;
		const shared = {
			animationsEnabled,
			downloadService: this.downloadService,
			gridColumns,
			imageCache: this.imageCache,
			isHeaderVisible: false,
			modalSlot: this.modalSlot,
			navBarContext: this.buildLibraryNavBarContext(),
			onHeaderVisibilityChange: this.handleLibraryHeaderVisibilityChange,
			onNavigationContext: this.handleNavigationContext,
			paletteQueue: this.paletteQueue,
			playbackStore: this.playbackStore,
			toastService: this.toastService,
			transport: this.transport,
		};

		if (context.kind === 'artist') {
			this.transport
				.getArtist(context.artist.id)
				.then((artist) => {
					if (!nav) return;
					nav.push(
						ArtistView,
						{ ...shared, artist: artist ?? context.artist },
						{},
						{ animated: false },
					);
					this.currentLibraryNavContext = { artist: artist ?? context.artist, kind: 'artist' };
				})
				.catch(this.handleSwallowedAsyncError);
		} else if (context.kind === 'album') {
			nav.push(AlbumView, { ...shared, album: context.album }, {}, { animated: false });
			this.currentLibraryNavContext = context;
		} else if (context.kind === 'playlist') {
			nav.push(
				PlaylistView,
				{ ...shared, playlist: context.playlist, playlistEditService: this.playlistEditService },
				{},
				{ animated: false },
			);
			this.currentLibraryNavContext = context;
		} else if (context.kind === 'genre') {
			nav.push(
				GenreView,
				{
					...shared,
					genre: context.genre,
					onNavigateToArtist: this.handleNavigateToArtist,
				},
				{},
				{ animated: false },
			);
			this.currentLibraryNavContext = context;
		}
	}

	handleSearchResultNavigation = (target: SearchLibraryNavigationTarget): void => {
		this.pendingSearchNavigation = target;
		this.returnToSearchOnDetailClose = true;

		const activeLibraryTab =
			target.kind === 'album'
				? HeaderTabs.albums
				: target.kind === 'artist'
					? HeaderTabs.artists
					: HeaderTabs.playlists;

		this.setState({
			activeFooterTab: FooterTabs.library,
			activeLibraryTab,
			isLibraryHeaderVisible: true,
			libraryResetNonce: this.state.libraryResetNonce + 1,
		});

		this.tryNavigatePendingSearchResult();
	};

	private handleSearchNavigationDetailExit = (): void => {
		if (!this.returnToSearchOnDetailClose) {
			return;
		}

		if (this.state.activeFooterTab !== FooterTabs.library) {
			return;
		}

		this.returnToSearchOnDetailClose = false;
		this.setState({
			activeFooterTab: FooterTabs.search,
			nowPlayingCollapseSignal: this.state.nowPlayingCollapseSignal + 1,
		});
	};

	private tryNavigatePendingSearchResult(): void {
		if (
			!this.pendingSearchNavigation ||
			!this.libraryNavigationController ||
			this.isResolvingSearchNavigation
		) {
			return;
		}

		this.isResolvingSearchNavigation = true;
		const target = this.pendingSearchNavigation;

		Promise.resolve().then(() => {
			if (this.pendingSearchNavigation !== target) {
				this.isResolvingSearchNavigation = false;
				return;
			}

			if (!this.libraryNavigationController) {
				this.isResolvingSearchNavigation = false;
				return;
			}

			if (target.kind === 'artist') {
				this.libraryNavigationController.push(
					ArtistView,
					{
						animationsEnabled: this.state.animationsEnabled,
						artist: target.artist,
						downloadService: this.downloadService,
						gridColumns: this.state.gridColumns,
						imageCache: this.imageCache,
						isHeaderVisible: false,
						modalSlot: this.modalSlot,
						navBarContext: this.buildLibraryNavBarContext(),
						onExitFromSearchNavigation: this.handleSearchNavigationDetailExit,
						onHeaderVisibilityChange: this.handleLibraryHeaderVisibilityChange,
						paletteQueue: this.paletteQueue,
						playbackStore: this.playbackStore,
						toastService: this.toastService,
						transport: this.transport,
					},
					{},
					{ animated: this.state.animationsEnabled },
				);
			}

			if (target.kind === 'album') {
				this.libraryNavigationController.push(
					AlbumView,
					{
						album: target.album as Album,
						animationsEnabled: this.state.animationsEnabled,
						downloadService: this.downloadService,
						gridColumns: this.state.gridColumns,
						imageCache: this.imageCache,
						isHeaderVisible: false,
						modalSlot: this.modalSlot,
						navBarContext: this.buildLibraryNavBarContext(),
						onExitFromSearchNavigation: this.handleSearchNavigationDetailExit,
						onHeaderVisibilityChange: this.handleLibraryHeaderVisibilityChange,
						paletteQueue: this.paletteQueue,
						playbackStore: this.playbackStore,
						toastService: this.toastService,
						transport: this.transport,
					},
					{},
					{ animated: this.state.animationsEnabled },
				);
			}

			if (target.kind === 'playlist') {
				this.libraryNavigationController.push(
					PlaylistView,
					{
						animationsEnabled: this.state.animationsEnabled,
						downloadService: this.downloadService,
						gridColumns: this.state.gridColumns,
						imageCache: this.imageCache,
						isHeaderVisible: false,
						modalSlot: this.modalSlot,
						navBarContext: this.buildLibraryNavBarContext(),
						onExitFromSearchNavigation: this.handleSearchNavigationDetailExit,
						onHeaderVisibilityChange: this.handleLibraryHeaderVisibilityChange,
						paletteQueue: this.paletteQueue,
						playbackStore: this.playbackStore,
						playlist: target.playlist as Playlist,
						playlistEditService: this.playlistEditService,
						toastService: this.toastService,
						transport: this.transport,
					},
					{},
					{ animated: this.state.animationsEnabled },
				);
			}

			this.pendingSearchNavigation = null;
			this.isResolvingSearchNavigation = false;
		});
	}

	handleNowPlayingTrackTap = (trackId: string): void => {
		const index = this.playbackStore.tracks.findIndex((t) => t.id === trackId);
		if (index !== -1) {
			this.playbackStore.jumpToIndex(index);
		}
	};

	handleNowPlayingDismiss = (): void => {
		this.playbackStore.stop();
	};

	private renderNowPlayingOverlay = (): void => {
		const { track, album, isPlaying, loopMode, artistLogoUrl, tracks, trackIndex } =
			this.playbackStore;
		const palette = this.paletteService.getPalette(track?.albumImageUrl ?? album?.imageUrl);
		if (!track) return;
		<ErrorBoundary resetKey={track.id}>
			<NowPlayingSurface
				album={album}
				animationsEnabled={this.state.animationsEnabled}
				artistLogoUrl={artistLogoUrl}
				barColors={this.barColors}
				collapseSignal={this.state.nowPlayingCollapseSignal}
				isPlaying={isPlaying}
				language={this.state.language}
				loopMode={loopMode}
				onAlbumTap={this.handleNowPlayingAlbumTap}
				onArtistTap={this.handleNowPlayingArtistTap}
				onDismiss={this.handleNowPlayingDismiss}
				onLoopModeToggle={this.handleNowPlayingLoopModeToggle}
				onNext={this.handleNowPlayingNext}
				onOpenPlaylist={this.handleNowPlayingOpenPlaylist}
				onPlayPause={this.handleNowPlayingPlayPause}
				onPrevious={this.handleNowPlayingPrevious}
				onProgressTap={this.handleNowPlayingProgressTap}
				onTrackTap={this.handleNowPlayingTrackTap}
				palette={palette}
				playbackStore={this.playbackStore}
				toastService={this.toastService}
				track={track}
				trackIndex={trackIndex}
				tracks={tracks}
				transport={this.transport}
				waveformMaskUrl={this.getWaveformMaskUrl(track.id)}
			/>
		</ErrorBoundary>;
	};

	handleNowPlayingNext = (): void => {
		this.playbackStore.next();
	};

	handleNowPlayingPlayPause = (): void => {
		this.playbackStore.playPause();
	};

	handleNowPlayingLoopModeToggle = (): void => {
		this.playbackStore.cycleLoopMode();
	};

	handleNowPlayingPrevious = (): void => {
		this.playbackStore.previousOrRestart();
	};

	handleNowPlayingProgressTap = (ratio?: number): void => {
		const activeTrack = this.playbackStore.track;
		if (!activeTrack) {
			return;
		}

		if (typeof ratio === 'number') {
			this.playbackStore.seekTo(activeTrack.duration * ratio);
			return;
		}

		this.playbackStore.skipForward(10);
	};

	private handleNativePlaybackNotificationAction(): void {
		const action = normalizeTrackPlaybackNotificationAction(
			consumeAtollaTrackPlaybackNotificationAction(),
		);
		if (action === '') {
			return;
		}

		applyTrackPlaybackNotificationAction(this.playbackStore, action);
	}

	private syncTrackPlaybackNotification(): void {
		const payload = buildTrackPlaybackNotificationPayload(this.playbackStore);
		if (!payload) {
			this.lastTrackNotificationStateKey = '';
			this.lastTrackNotificationPositionBucket = -1;
			clearAtollaTrackPlaybackNotification();
			return;
		}

		if (
			payload.stateKey === this.lastTrackNotificationStateKey &&
			payload.positionBucket === this.lastTrackNotificationPositionBucket
		) {
			return;
		}

		this.lastTrackNotificationStateKey = payload.stateKey;
		this.lastTrackNotificationPositionBucket = payload.positionBucket;

		if (!ensureAtollaTrackPlaybackNotificationPermission()) {
			return;
		}

		updateAtollaTrackPlaybackNotification(
			payload.trackName,
			payload.artistName,
			payload.albumName,
			payload.artworkUrl,
			payload.isPlaying,
			payload.positionSeconds,
			payload.durationSeconds,
			payload.hasPrevious,
			payload.hasNext,
		);
	}

	handleNavigateToArtist = (artistId: string): void => {
		if (!this.libraryNavigationController) {
			return;
		}
		const navigationController = this.libraryNavigationController;
		this.transport
			.getArtist(artistId)
			.then((artist) => {
				if (!artist) return;
				navigationController.push(
					ArtistView,
					{
						animationsEnabled: this.state.animationsEnabled,
						artist,
						downloadService: this.downloadService,
						gridColumns: this.state.gridColumns,
						imageCache: this.imageCache,
						isHeaderVisible: false,
						modalSlot: this.modalSlot,
						navBarContext: this.buildLibraryNavBarContext(),
						onHeaderVisibilityChange: this.handleLibraryHeaderVisibilityChange,
						paletteQueue: this.paletteQueue,
						playbackStore: this.playbackStore,
						toastService: this.toastService,
						transport: this.transport,
					},
					{},
					{ animated: this.state.animationsEnabled },
				);
			})
			.catch(this.handleSwallowedAsyncError);
	};

	handleNowPlayingArtistTap = (track?: Track): void => {
		if (track) {
			if (!track.artistId) {
				return;
			}
			this.navigateToArtist(track.artistId, track.artistName ?? 'Unknown Artist', null);
			return;
		}

		const { album, artistLogoUrl, track: playing } = this.playbackStore;
		const artistId = playing?.artistId ?? album?.artistId;
		if (!artistId) {
			return;
		}
		this.navigateToArtist(
			artistId,
			playing?.artistName ?? album?.artistName ?? 'Unknown Artist',
			artistLogoUrl ?? null,
		);
	};

	private navigateToArtist(
		artistId: string,
		fallbackName: string,
		fallbackLogoUrl: string | null,
	): void {
		this.pendingArtistId = artistId;
		this.pendingArtistFallbackName = fallbackName;
		this.pendingArtistFallbackLogoUrl = fallbackLogoUrl;
		this.setState({
			activeFooterTab: FooterTabs.library,
			activeLibraryTab: HeaderTabs.artists,
			isLibraryHeaderVisible: true,
			libraryResetNonce: this.state.libraryResetNonce + 1,
		});

		this.tryNavigatePendingArtist();
	}

	private tryNavigatePendingArtist(): void {
		if (
			!this.pendingArtistId ||
			!this.libraryNavigationController ||
			this.isResolvingArtistNavigation
		) {
			return;
		}

		this.isResolvingArtistNavigation = true;
		const pendingArtistId = this.pendingArtistId;
		this.transport
			.getArtist(pendingArtistId)
			.then((artist) => {
				if (this.pendingArtistId !== pendingArtistId) {
					this.isResolvingArtistNavigation = false;
					return;
				}

				const resolvedArtist: Artist =
					artist ??
					({
						id: pendingArtistId,
						logoUrl: this.pendingArtistFallbackLogoUrl ?? null,
						name: this.pendingArtistFallbackName,
					} as Artist);
				this.libraryNavigationController?.push(
					ArtistView,
					{
						animationsEnabled: this.state.animationsEnabled,
						artist: resolvedArtist,
						downloadService: this.downloadService,
						gridColumns: this.state.gridColumns,
						imageCache: this.imageCache,
						isHeaderVisible: false,
						modalSlot: this.modalSlot,
						navBarContext: this.buildLibraryNavBarContext(),
						onHeaderVisibilityChange: this.handleLibraryHeaderVisibilityChange,
						paletteQueue: this.paletteQueue,
						playbackStore: this.playbackStore,
						toastService: this.toastService,
						transport: this.transport,
					},
					{},
					{ animated: this.state.animationsEnabled },
				);

				this.pendingArtistId = null;
				this.pendingArtistFallbackName = 'Unknown Artist';
				this.pendingArtistFallbackLogoUrl = null;
				this.isResolvingArtistNavigation = false;
			})
			.catch(() => {
				this.isResolvingArtistNavigation = false;
			});
	}

	handleNowPlayingAlbumTap = (track?: Track): void => {
		const resolvedAlbum = track
			? this.albumFromTrack(track)
			: (this.playbackStore.album ?? this.albumFromTrack(this.playbackStore.track));
		if (!resolvedAlbum) {
			return;
		}
		this.navigateToAlbum(resolvedAlbum);
	};

	private albumFromTrack(track: Track | null | undefined): Album | null {
		if (!track?.albumId) {
			return null;
		}
		return {
			artistId: track.artistId ?? '',
			artistName: track.artistName ?? '',
			id: track.albumId,
			imageUrl: track.albumImageUrl,
			name: track.albumName ?? '',
			releaseDate: track.releaseDate,
		};
	}

	private navigateToAlbum(album: Album): void {
		this.pendingAlbum = album;
		this.setState({
			activeFooterTab: FooterTabs.library,
			activeLibraryTab: HeaderTabs.albums,
			isLibraryHeaderVisible: true,
			libraryResetNonce: this.state.libraryResetNonce + 1,
		});

		this.tryNavigatePendingAlbum();
	}

	handleHomeArtistTap = (artistId: string): void => {
		if (!this.homeNavigationController) {
			return;
		}
		const navigationController = this.homeNavigationController;
		this.transport
			.getArtist(artistId)
			.then((artist) => {
				if (!artist) return;
				navigationController.push(
					ArtistView,
					{
						animationsEnabled: this.state.animationsEnabled,
						artist,
						downloadService: this.downloadService,
						gridColumns: this.state.gridColumns,
						imageCache: this.imageCache,
						isHeaderVisible: false,
						modalSlot: this.modalSlot,
						navBarContext: this.buildHomeNavBarContext(),
						onHeaderVisibilityChange: this.handleHomeHeaderVisibilityChange,
						paletteQueue: this.paletteQueue,
						playbackStore: this.playbackStore,
						toastService: this.toastService,
						transport: this.transport,
					},
					{},
					{ animated: this.state.animationsEnabled },
				);
			})
			.catch(this.handleSwallowedAsyncError);
	};

	handleHomeAlbumTap = (album: Album): void => {
		this.returnToSearchOnDetailClose = false;

		if (!this.homeNavigationController) {
			return;
		}

		this.homeNavigationController.push(
			AlbumView,
			{
				album,
				animationsEnabled: this.state.animationsEnabled,
				downloadService: this.downloadService,
				gridColumns: this.state.gridColumns,
				imageCache: this.imageCache,
				modalSlot: this.modalSlot,
				navBarContext: this.buildHomeNavBarContext(),
				onHeaderVisibilityChange: this.handleHomeHeaderVisibilityChange,
				paletteQueue: this.paletteQueue,
				playbackStore: this.playbackStore,
				restoreHeaderOnDestroy: false,
				toastService: this.toastService,
				transport: this.transport,
			},
			{},
			{ animated: this.state.animationsEnabled },
		);
	};

	handleHomeOpenPlaylist = (playlist: Playlist): void => {
		if (!this.homeNavigationController) return;
		this.homeNavigationController.push(
			PlaylistView,
			{
				animationsEnabled: this.state.animationsEnabled,
				downloadService: this.downloadService,
				gridColumns: this.state.gridColumns,
				imageCache: this.imageCache,
				modalSlot: this.modalSlot,
				navBarContext: this.buildHomeNavBarContext(),
				paletteQueue: this.paletteQueue,
				playbackStore: this.playbackStore,
				playlist,
				playlistEditService: this.playlistEditService,
				toastService: this.toastService,
				transport: this.transport,
			},
			{},
			{ animated: this.state.animationsEnabled },
		);
	};

	handleNowPlayingOpenPlaylist = (playlist: Playlist): void => {
		// Invoked from the now playing surface, which can be open over any tab. Switching
		// to home may mount its navigation controller asynchronously, so stash the playlist
		// and let tryNavigatePendingPlaylist push once the controller is available (mirrors
		// the pending album/artist navigation). A one-shot push silently no-ops on iOS when
		// the home controller isn't mounted yet.
		this.pendingPlaylist = playlist;
		this.setState({ activeFooterTab: FooterTabs.home });
		this.tryNavigatePendingPlaylist();
	};

	private tryNavigatePendingPlaylist(): void {
		if (!this.pendingPlaylist || !this.homeNavigationController) {
			return;
		}

		const playlist = this.pendingPlaylist;
		this.pendingPlaylist = null;
		this.homeNavigationController.push(
			PlaylistView,
			{
				animationsEnabled: this.state.animationsEnabled,
				downloadService: this.downloadService,
				gridColumns: this.state.gridColumns,
				imageCache: this.imageCache,
				modalSlot: this.modalSlot,
				navBarContext: this.buildHomeNavBarContext(),
				paletteQueue: this.paletteQueue,
				playbackStore: this.playbackStore,
				playlist,
				playlistEditService: this.playlistEditService,
				toastService: this.toastService,
				transport: this.transport,
			},
			{},
			{ animated: this.state.animationsEnabled },
		);
	}

	private tryNavigatePendingAlbum(): void {
		if (
			!this.pendingAlbum ||
			!this.libraryNavigationController ||
			this.isResolvingAlbumNavigation
		) {
			return;
		}

		this.isResolvingAlbumNavigation = true;
		const album = this.pendingAlbum;
		Promise.resolve().then(() => {
			if (this.pendingAlbum !== album) {
				this.isResolvingAlbumNavigation = false;
				return;
			}
			if (!this.libraryNavigationController) {
				this.isResolvingAlbumNavigation = false;
				return;
			}
			this.libraryNavigationController.push(
				AlbumView,
				{
					album,
					animationsEnabled: this.state.animationsEnabled,
					downloadService: this.downloadService,
					gridColumns: this.state.gridColumns,
					imageCache: this.imageCache,
					isHeaderVisible: false,
					modalSlot: this.modalSlot,
					navBarContext: this.buildLibraryNavBarContext(),
					onHeaderVisibilityChange: this.handleLibraryHeaderVisibilityChange,
					paletteQueue: this.paletteQueue,
					playbackStore: this.playbackStore,
					toastService: this.toastService,
					transport: this.transport,
				},
				{},
				{ animated: this.state.animationsEnabled },
			);
			this.pendingAlbum = null;
			this.isResolvingAlbumNavigation = false;
		});
	}

	private completeBootstrap(
		partialState: Partial<
			Pick<
				AppState,
				| 'animationsEnabled'
				| 'authErrorMessage'
				| 'connectionMode'
				| 'gridColumns'
				| 'imageCacheMaxBytes'
				| 'isAuthRequired'
				| 'jellyfinClientDeviceIdOverride'
				| 'language'
				| 'serverName'
				| 'serverUrlPrefill'
				| 'trackCacheMaxTracks'
			>
		>,
	): void {
		const elapsed = Date.now() - this.bootstrapStartedAt;
		const remaining = Math.max(0, this.minimumBootSplashMs - elapsed);
		if (this.bootstrapCommitTimer) {
			clearTimeout(this.bootstrapCommitTimer);
		}
		this.bootstrapCommitTimer = setTimeout(() => {
			this.setState({ ...partialState, isBootstrapped: true });
			void this.scrobbleService?.onAppReady();
		}, remaining);
	}

	private syncScrobblePlaybackSnapshot(): void {
		if (!this.scrobbleService) {
			return;
		}

		const activeTrack = this.playbackStore.track;
		this.scrobbleService.observePlayback({
			hasSeekTarget: this.playbackStore.seekTarget != null,
			isPlaying: this.playbackStore.isPlaying,
			progressSeconds: this.playbackStore.progressSeconds,
			trackDurationSeconds: activeTrack?.duration ?? 0,
			trackId: activeTrack?.id ?? null,
		});
	}

	private buildLibraryNavBarContext(): NavBarContext | undefined {
		if (Device.isAndroid()) return undefined;
		return {
			activeFooterTab: this.state.activeFooterTab,
			barColors: this.barColors,
			downloadingCount: this.state.downloadingCount,
			header: {
				activeTab: this.state.activeLibraryTab,
				animationsEnabled: this.state.animationsEnabled,
				connectionMode: this.state.connectionMode,
				onAlphabetLetterTap: this.handleLibraryAlphabetLetterTap,
				onRequestModeChange: this.requestModeChange,
				onTabTap: this.handleLibraryHeaderTabTap,
			},
			modalSlot: this.modalSlot,
			nowPlayingOverlaySlot: this.nowPlayingOverlaySlot,
			onFooterTabTap: this.handleFooterTabTap,
		};
	}

	private buildHomeNavBarContext(): NavBarContext | undefined {
		if (Device.isAndroid()) return undefined;
		return {
			activeFooterTab: this.state.activeFooterTab,
			barColors: this.barColors,
			downloadingCount: this.state.downloadingCount,
			header: {
				activeTab: HeaderTabs.albums,
				animationsEnabled: this.state.animationsEnabled,
				connectionMode: this.state.connectionMode,
				onRequestModeChange: this.requestModeChange,
				onTabTap: this.handleHomeHeaderTabTap,
			},
			modalSlot: this.modalSlot,
			nowPlayingOverlaySlot: this.nowPlayingOverlaySlot,
			onFooterTabTap: this.handleFooterTabTap,
		};
	}

	private buildSearchNavBarContext(): NavBarContext | undefined {
		if (Device.isAndroid()) return undefined;
		return {
			activeFooterTab: this.state.activeFooterTab,
			barColors: this.barColors,
			downloadingCount: this.state.downloadingCount,
			modalSlot: this.modalSlot,
			nowPlayingOverlaySlot: this.nowPlayingOverlaySlot,
			onFooterTabTap: this.handleFooterTabTap,
		};
	}

	onRender(): void {
		if (!this.state.isBootstrapped) {
			<BootSplash message='loading your library' />;
			return;
		}

		if (this.state.isAuthRequired) {
			<view style={styles.root}>
				<ConnectionView
					animationsEnabled={this.state.animationsEnabled}
					errorMessage={this.state.authErrorMessage}
					isConnecting={this.state.isAuthenticating}
					modalSlot={this.modalSlot}
					onConnect={this.handleConnect}
					onLanguageChange={this.handleLanguageChange}
					quickConnectCode={this.state.quickConnectCode}
					selectedLanguage={this.state.language}
					serverUrl={this.state.serverUrlPrefill}
					toastService={this.toastService}
				/>
				<DetachedSlotRenderer detachedSlot={this.modalSlot} />
				<DetachedSlotRenderer detachedSlot={this.toastSlot} />
			</view>;
			return;
		}

		const { track, album, isPlaying, loopMode, artistLogoUrl, tracks, trackIndex } =
			this.playbackStore;
		const palette = this.paletteService.getPalette(track?.albumImageUrl ?? album?.imageUrl);

		<view style={styles.root}>
			<view style={styles.content}>
				{this.state.connectionMode === ConnectionModes.mock ? (
					<MockPlayer playbackStore={this.playbackStore} />
				) : (
					<GaplessPlayer
						activeSourceUrl={this.state.trackPlaybackSourceUrl}
						nextSourceUrl={this.state.nextTrackSourceUrl}
						onPlaybackError={this.handlePlaybackError}
						onPlaybackEvent={this.handlePlaybackEvent}
						onTrackCompleted={this.handleTrackCompleted}
						playbackStore={this.playbackStore}
					/>
				)}
				<ErrorBoundary resetKey={this.state.activeFooterTab}>
					{this.state.activeFooterTab === FooterTabs.home && this.state.isHomeNavigationMounted && (
						<NavigationRoot>
							{$slot((navigationController) => {
								this.handleHomeNavigationControllerChange(navigationController);
								<HomeView
									animationsEnabled={this.state.animationsEnabled}
									connectionMode={this.state.connectionMode}
									gridColumns={this.state.gridColumns}
									homeAlbumsStore={this.homeAlbumsStore}
									imageCache={this.imageCache}
									modalSlot={this.modalSlot}
									onNavigateToArtist={this.handleHomeArtistTap}
									onOpenAlbum={this.handleHomeAlbumTap}
									onOpenPlaylist={this.handleHomeOpenPlaylist}
									onRequestModeChange={this.requestModeChange}
									onThisDayService={this.onThisDayService}
									playbackStore={this.playbackStore}
									recentlyPlayedTracks={this.recentlyPlayedTracks}
									toastService={this.toastService}
									transport={this.transport}
								/>;
							})}
						</NavigationRoot>
					)}

					{this.state.activeFooterTab === FooterTabs.library && (
						<LibraryView
							activeTab={this.state.activeLibraryTab}
							animationsEnabled={this.state.animationsEnabled}
							connectionMode={this.state.connectionMode}
							downloadService={this.downloadService}
							gridColumns={this.state.gridColumns}
							imageCache={this.imageCache}
							letterFilter={this.state.libraryLetterFilter}
							modalSlot={this.modalSlot}
							navBarContext={this.buildLibraryNavBarContext()}
							onHeaderVisibilityChange={this.handleLibraryHeaderVisibilityChange}
							onNavigateToArtist={this.handleNavigateToArtist}
							onNavigationContext={this.handleNavigationContext}
							onNavigationControllerChange={this.handleLibraryNavigationControllerChange}
							paletteQueue={this.paletteQueue}
							playbackStore={this.playbackStore}
							playlistEditService={this.playlistEditService}
							resetSignal={this.state.libraryResetNonce}
							toastService={this.toastService}
							transport={this.transport}
						/>
					)}
					{this.state.activeFooterTab === FooterTabs.search && (
						<NavigationRoot>
							{$slot((navigationController) => {
								<SearchView
									animationsEnabled={this.state.animationsEnabled}
									downloadService={this.downloadService}
									focusSignal={this.state.searchFocusSignal}
									gridColumns={this.state.gridColumns}
									imageCache={this.imageCache}
									modalSlot={this.modalSlot}
									navBarContext={this.buildSearchNavBarContext()}
									navigationController={navigationController}
									onNavigateToLibraryResult={this.handleSearchResultNavigation}
									paletteQueue={this.paletteQueue}
									playbackStore={this.playbackStore}
									playlistEditService={this.playlistEditService}
									searchStore={this.searchStore}
									toastService={this.toastService}
									transport={this.transport}
								/>;
							})}
						</NavigationRoot>
					)}
					{this.state.activeFooterTab === FooterTabs.settings && this.state.isSettingsMounted && (
						<SettingsView
							animationsEnabled={this.state.animationsEnabled}
							connectionMode={this.state.connectionMode}
							debugExportPath={this.state.debugExportPath}
							debugLogFilePath={this.state.debugLogFilePath}
							debugLoggingEnabled={this.state.debugLoggingEnabled}
							defaultJellyfinDeviceId={this.defaultJellyfinClientDeviceId}
							downloadedSizeBytes={this.state.downloadedSizeBytes ?? undefined}
							downloadedTrackCount={this.state.downloadedTrackCount}
							downloadingCount={this.state.downloadingCount}
							gridColumns={this.state.gridColumns}
							imageCacheDiskBytes={this.state.nativeImageCacheDiskBytes}
							imageCacheDiskCount={this.state.nativeImageCacheDiskCount}
							imageCacheError={null}
							imageCacheMaxBytes={this.state.imageCacheMaxBytes}
							imageCategoryAlbumArtBlurredCount={
								this.state.imageCategoryCounts.album_art_blurred ?? 0
							}
							imageCategoryAlbumArtCount={
								(this.state.imageCategoryCounts.album_art ?? 0) +
								(this.state.imageCategoryCounts.album_art_thumb ?? 0)
							}
							imageCategoryArtistImageCount={
								(this.state.imageCategoryCounts.artist_image ?? 0) +
								(this.state.imageCategoryCounts.artist_image_thumb ?? 0)
							}
							imageCategoryArtistLogoCount={this.state.imageCategoryCounts.artist_logo ?? 0}
							imageCategoryGenreImageCount={this.state.imageCategoryCounts.genre_art ?? 0}
							imageCategoryPlaylistImageCount={
								(this.state.imageCategoryCounts.playlist_image ?? 0) +
								(this.state.imageCategoryCounts.playlist_image_thumb ?? 0)
							}
							jellyfinDeviceIdOverride={this.state.jellyfinClientDeviceIdOverride}
							modalSlot={this.modalSlot}
							offlineStatusExportPath={this.state.offlineStatusExportPath}
							onAnimationsChange={this.handleAnimationsChange}
							onCacheSizeChange={this.handleCacheSizeChange}
							onClearCache={this.handleClearCache}
							onClearDebugLog={this.handleClearDebugLog}
							onClearDownloads={this.handleClearDownloads}
							onDebugLoggingChange={this.handleDebugLoggingChange}
							onExportDebugLog={this.handleExportDebugLog}
							onExportOfflineStatus={this.handleExportOfflineStatus}
							onGridColumnsChange={this.handleGridColumnsChange}
							onJellyfinDeviceIdOverrideChange={this.handleJellyfinClientDeviceIdOverrideChange}
							onLanguageChange={this.handleLanguageChange}
							onLogout={this.handleLogout}
							onRequestModeChange={this.requestModeChange}
							onTrackCacheMaxTracksChange={this.handleTrackCacheMaxTracksChange}
							preferences={this.preferences}
							selectedLanguage={this.state.language}
							serverName={this.state.serverName}
							serverUrl={this.state.serverUrlPrefill}
							toastService={this.toastService}
							trackCacheCachedCount={this.state.trackPlaybackCachedCount}
							trackCacheMaxTracks={this.state.trackCacheMaxTracks}
							waveformReadyCount={this.waveformService.getReadyCount()}
						/>
					)}
				</ErrorBoundary>
				{track && (
					<ErrorBoundary resetKey={track.id}>
						<NowPlayingSurface
							album={album}
							animationsEnabled={this.state.animationsEnabled}
							artistLogoUrl={artistLogoUrl}
							barColors={this.barColors}
							collapseSignal={this.state.nowPlayingCollapseSignal}
							isPlaying={isPlaying}
							language={this.state.language}
							loopMode={loopMode}
							onAlbumTap={this.handleNowPlayingAlbumTap}
							onArtistTap={this.handleNowPlayingArtistTap}
							onDismiss={this.handleNowPlayingDismiss}
							onLoopModeToggle={this.handleNowPlayingLoopModeToggle}
							onNext={this.handleNowPlayingNext}
							onOpenPlaylist={this.handleNowPlayingOpenPlaylist}
							onPlayPause={this.handleNowPlayingPlayPause}
							onPrevious={this.handleNowPlayingPrevious}
							onProgressTap={this.handleNowPlayingProgressTap}
							onTrackTap={this.handleNowPlayingTrackTap}
							palette={palette}
							playbackStore={this.playbackStore}
							toastService={this.toastService}
							track={track}
							trackIndex={trackIndex}
							tracks={tracks}
							transport={this.transport}
							waveformMaskUrl={this.getWaveformMaskUrl(track.id)}
						/>
					</ErrorBoundary>
				)}

				{this.state.activeFooterTab === FooterTabs.library && this.state.isLibraryHeaderVisible && (
					<LibraryHeaderNav
						activeTab={this.state.activeLibraryTab}
						animationsEnabled={this.state.animationsEnabled}
						connectionMode={this.state.connectionMode}
						onAlphabetLetterTap={this.handleLibraryAlphabetLetterTap}
						onRequestModeChange={this.requestModeChange}
						onTabTap={this.handleLibraryHeaderTabTap}
					/>
				)}
				{this.state.activeFooterTab === FooterTabs.home && this.state.isHomeHeaderVisible && (
					<LibraryHeaderNav
						activeTab={HeaderTabs.albums}
						animationsEnabled={this.state.animationsEnabled}
						connectionMode={this.state.connectionMode}
						onRequestModeChange={this.requestModeChange}
						onTabTap={this.handleHomeHeaderTabTap}
					/>
				)}

				{this.state.syncProgress && (
					<SyncStatusBanner
						completed={this.state.syncProgress.completed}
						onTap={this.handleSyncBannerTap}
						status={this.state.syncProgress.status}
						total={this.state.syncProgress.total}
					/>
				)}
			</view>

			<FooterNav
				activeTab={this.state.activeFooterTab}
				barColors={this.barColors}
				downloadingCount={this.state.downloadingCount}
				onFooterTabTap={this.handleFooterTabTap}
			/>
			<DetachedSlotRenderer detachedSlot={this.modalSlot} />
			<DetachedSlotRenderer detachedSlot={this.toastSlot} />
		</view>;
	}
}

const styles = {
	content: new Style({
		alignItems: 'center' as const,
		flexGrow: 1,
		justifyContent: 'flex-start' as const,
		position: 'relative' as const,
		width: '100%',
	}),
	root: new Style({
		backgroundColor: theme.colors.bg,
		flexDirection: 'column' as const,
		height: '100%',
		position: 'relative' as const,
		width: '100%',
	}),
};
