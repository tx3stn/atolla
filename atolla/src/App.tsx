// @ts-nocheck
import { PersistentStore } from 'persistence/src/PersistentStore';
import { AssetOutputType, addAssetLoadObserver } from 'valdi_core/src/Asset';
import { $slot } from 'valdi_core/src/CompilerIntrinsics';
import { StatefulComponent } from 'valdi_core/src/Component';
import { Device } from 'valdi_core/src/Device';
import { Style } from 'valdi_core/src/Style';
import type { NavigationController } from 'valdi_navigation/src/NavigationController';
import { NavigationRoot } from 'valdi_navigation/src/NavigationRoot';
import { AuthErrors } from './errors/AuthErrors';
import {
	clearAtollaNativeCacheCategories,
	ensureAtollaImageLoaderBootstrap,
	getAtollaImageLoaderDiskCacheByteSize,
	getAtollaImageLoaderDiskCacheEntryCount,
	preloadAtollaImages,
	setAtollaImageCachedObserver,
	setAtollaImageLoaderDiskCacheMaxBytes,
} from './ImageLoaderBootstrap';
import type { Album } from './models/Album';
import type { Artist } from './models/Artist';
import type { Playlist } from './models/Playlist';
import type { Track } from './models/Track';
import { ArtworkPaletteService } from './services/ArtworkPaletteService';
import { DownloadService } from './services/DownloadService';
import type { ClearCacheSelection } from './services/ImageCache';
import { buildImageSource } from './services/ImageSource';
import { type AuthSession, JellyfinAuthService } from './services/JellyfinAuthService';
import { PaletteGenerationQueue } from './services/PaletteGenerationQueue';
import { PersistentPaletteStore } from './services/PersistentPaletteStore';
import { ScrobbleService } from './services/ScrobbleService';
import { TrackPlaybackNativePrefetchQueue } from './services/TrackPlaybackNativePrefetchQueue';
import {
	applyTrackPlaybackNotificationAction,
	buildTrackPlaybackNotificationPayload,
	normalizeTrackPlaybackNotificationAction,
} from './services/TrackPlaybackNotificationSync';
import { WriteBehindPaletteStore } from './services/WriteBehindPaletteStore';
import {
	JellyfinAuthStore,
	type JellyfinAuthStoreLike,
	type StoredAuthSession,
} from './stores/JellyfinAuthStore';
import { PlaybackStore } from './stores/Playback';
import {
	DEFAULT_GRID_COLUMNS,
	DEFAULT_IMAGE_CACHE_MAX_BYTES,
	DEFAULT_TRACK_CACHE_MAX_TRACKS,
	Preferences,
} from './stores/Preferences';
import { SearchStore } from './stores/Search';
import {
	cacheAtollaDownloadedTrackFromUrlAsync,
	cacheAtollaTrackFromUrlAsync,
	clearAtollaTrackCache,
	clearAtollaTrackPlaybackNotification,
	consumeAtollaTrackPlaybackNotificationAction,
	ensureAtollaTrackPlaybackNotificationPermission,
	getAtollaCachedTrackFileUrl,
	getAtollaDeviceUserScopeKey,
	getAtollaDownloadedCacheTotalSizeBytes,
	getAtollaDownloadedTrackFileUrl,
	getAtollaTrackCacheEntryCount,
	removeAtollaDownloadedTrack,
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
import { FooterNav } from './ui/components/FooterNav';
import { type FooterTab, FooterTabs } from './ui/components/FooterTab';
import { type HeaderTab, HeaderTabs } from './ui/components/HeaderTabs';
import { HomeHeaderNav } from './ui/components/HomeHeaderNav';
import { MockPlayer } from './ui/components/MockPlayer';
import { NowPlayingSurface } from './ui/components/NowPlayingSurface';
import { Toast } from './ui/components/Toast';
import { VideoAudioPlayer } from './ui/components/VideoAudioPlayer';
import { AlbumView } from './ui/views/AlbumView';
import { ArtistView } from './ui/views/ArtistView';
import { ConnectionView } from './ui/views/ConnectionView';
import { type HomeNavContext, HomeView } from './ui/views/HomeView';
import { PlaylistView } from './ui/views/PlaylistView';
import { type SearchHomeNavigationTarget, SearchView } from './ui/views/SearchView';
import { SettingsView } from './ui/views/SettingsView';

export type AppViewModel = Record<string, never>;

interface AppState {
	activeFooterTab: FooterTab;
	activeHomeTab: HeaderTab;
	animationsEnabled: boolean;
	authErrorMessage: string | null;
	authToastMessage: string | null;
	connectionMode: ConnectionMode;
	downloadedSizeBytes: number | null;
	downloadedTrackCount: number;
	downloadingCount: number;
	gridColumns: number;
	homeResetNonce: number;
	imageCacheMaxBytes: number;
	isAuthenticating: boolean;
	isAuthRequired: boolean;
	isBootstrapped: boolean;
	nativeImageCacheDiskBytes: number | null;
	nativeImageCacheDiskCount: number | null;
	nowPlayingCollapseSignal: number;
	playbackToastMessage: string | null;
	quickConnectCode: string | null;
	searchFocusSignal: number;
	serverUrlPrefill: string;
	trackCacheMaxTracks: number;
	trackPlaybackCachedCount: number;
	trackPlaybackSourceUrl: string | null;
	version: number;
}

class InMemoryAuthStore implements JellyfinAuthStoreLike {
	private session: StoredAuthSession | null = null;
	private serverUrl = '';

	loadSession(): Promise<StoredAuthSession | null> {
		return Promise.resolve(this.session);
	}

	saveSession(session: StoredAuthSession): Promise<void> {
		this.session = {
			accessToken: session.accessToken,
			serverId: session.serverId,
			serverUrl: session.serverUrl,
			userId: session.userId,
		};
		this.serverUrl = session.serverUrl;
		return Promise.resolve();
	}

	clearSession(): Promise<void> {
		this.session = null;
		return Promise.resolve();
	}

	rememberServerUrl(serverUrl: string): Promise<void> {
		this.serverUrl = serverUrl;
		return Promise.resolve();
	}

	loadRememberedServerUrl(): Promise<string> {
		return Promise.resolve(this.serverUrl);
	}
}

export class App extends StatefulComponent<AppViewModel, AppState> {
	private playbackStore = new PlaybackStore();
	private preferences = new Preferences(
		new PersistentStore('atolla/preferences', { deviceGlobal: true }),
	);
	private authService = this.createAuthService();

	private createAuthService(): JellyfinAuthService {
		const scopeKey = this.resolveDeviceUserScopeKey();
		const authStoreNamespace = `atolla/device-user/${scopeKey}/jellyfin_auth`;
		try {
			return new JellyfinAuthService({
				store: new JellyfinAuthStore(
					new PersistentStore(authStoreNamespace, {
						deviceGlobal: true,
						enableEncryption: true,
					}),
				),
			});
		} catch {
			try {
				return new JellyfinAuthService({
					store: new JellyfinAuthStore(
						new PersistentStore(authStoreNamespace, { deviceGlobal: true }),
					),
				});
			} catch {
				return new JellyfinAuthService({
					store: new InMemoryAuthStore(),
				});
			}
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
	private searchStore!: SearchStore;
	private transport: Transport = new MockTransport();
	private paletteService!: ArtworkPaletteService;
	private downloadService = new DownloadService({
		cacheTrack: (trackId, url) =>
			new Promise<void>((resolve, reject) => {
				cacheAtollaDownloadedTrackFromUrlAsync(trackId, url, (source) => {
					if (source) resolve();
					else reject(new Error('cacheAtollaDownloadedTrackFromUrlAsync returned no source'));
				});
			}),
		getTotalDownloadedSizeBytes: () => getAtollaDownloadedCacheTotalSizeBytes(),
		getTrackPlaybackUrl: (trackId) => getAtollaDownloadedTrackFileUrl(trackId),
		preloadImages: (urls, category) => {
			try {
				preloadAtollaImages(urls, category);
			} catch {
				// Non-Android targets do not provide native preload bridge.
			}
		},
		removeTrack: (trackId) => removeAtollaDownloadedTrack(trackId),
		store: new PersistentStore('atolla/downloads', { deviceGlobal: true }),
	});
	private paletteQueue!: PaletteGenerationQueue;
	private unsubscribePlayback?: () => void;
	private unsubscribePalette?: () => void;
	private scrobbleService?: ScrobbleService;
	private authToastTimer?: ReturnType<typeof setTimeout>;
	private playbackToastTimer?: ReturnType<typeof setTimeout>;
	private nativeCacheStatsInterval?: ReturnType<typeof setInterval>;
	private nativePlaybackActionInterval?: ReturnType<typeof setInterval>;
	private lastArtworkUrl: string | null = null;
	private homeNavigationController?: NavigationController;
	private pendingArtistId: string | null = null;
	private pendingArtistFallbackName: string = 'Unknown Artist';
	private pendingArtistFallbackLogoUrl: string | null = null;
	private isResolvingArtistNavigation = false;
	private pendingAlbum: Album | null = null;
	private isResolvingAlbumNavigation = false;
	private pendingSearchNavigation: SearchHomeNavigationTarget | null = null;
	private isResolvingSearchNavigation = false;
	private returnToSearchOnDetailClose = false;
	private currentHomeNavContext: HomeNavContext | null = null;
	private pendingNavRestoreContext: HomeNavContext | null = null;
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
	private lastTrackNotificationStateKey = '';
	private lastTrackNotificationPositionBucket = -1;
	private trackPrefetchQueue = new TrackPlaybackNativePrefetchQueue(
		(track) => this.transport.getTrackCacheUrl?.(track.id) ?? null,
		(trackId) => this.getNativeCachedTrackSource(trackId) != null,
		(trackId, url, onComplete) => {
			cacheAtollaTrackFromUrlAsync(trackId, url, (rawSource) => {
				onComplete(rawSource ? this.normalizePlaybackFileSource(rawSource) : null);
			});
		},
		(trackId) => this.handleTrackCached(trackId),
	);

	state: AppState = {
		activeFooterTab: FooterTabs.home,
		activeHomeTab: HeaderTabs.artists,
		animationsEnabled: true,
		authErrorMessage: null,
		authToastMessage: null,
		connectionMode: ConnectionModes.offline,
		downloadedSizeBytes: null,
		downloadedTrackCount: 0,
		downloadingCount: 0,
		gridColumns: DEFAULT_GRID_COLUMNS,
		homeResetNonce: 0,
		imageCacheMaxBytes: DEFAULT_IMAGE_CACHE_MAX_BYTES,
		isAuthenticating: false,
		isAuthRequired: false,
		isBootstrapped: false,
		nativeImageCacheDiskBytes: null,
		nativeImageCacheDiskCount: null,
		nowPlayingCollapseSignal: 0,
		playbackToastMessage: null,
		quickConnectCode: null,
		searchFocusSignal: 0,
		serverUrlPrefill: '',
		trackCacheMaxTracks: DEFAULT_TRACK_CACHE_MAX_TRACKS,
		trackPlaybackCachedCount: 0,
		trackPlaybackSourceUrl: null,
		version: 0,
	};

	onCreate(): void {
		this.bootstrapStartedAt = Date.now();
		try {
			ensureAtollaImageLoaderBootstrap();
		} catch {
			// Android native bootstrap may be unavailable on non-Android targets.
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
				this.authService.loadSession(),
				this.authService.loadRememberedServerUrl(),
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
					existingSession,
					rememberedServerUrl,
				]) => {
					this.authService.setMockMode(mode === ConnectionModes.mock);
					try {
						setAtollaImageLoaderDiskCacheMaxBytes(imageCacheMaxBytes);
					} catch {
						// Native disk cache unavailable on non-Android targets.
					}
					if (mode === ConnectionModes.online && existingSession != null) {
						this.transport = new LiveTransport(
							existingSession.serverUrl,
							existingSession.accessToken,
							existingSession.userId,
						);
					} else if (mode === ConnectionModes.online) {
						this.transport = new OfflineTransport(this.downloadService);
					} else if (mode === ConnectionModes.offline) {
						this.transport = new OfflineTransport(this.downloadService);
					} else if (mode === ConnectionModes.mock) {
						this.transport = new MockTransport();
					}

					const isAuthRequired = mode === ConnectionModes.online && existingSession == null;
					const userId = existingSession != null ? existingSession.userId : 'shared';
					this.initUserStores(userId);

					this.completeBootstrap({
						animationsEnabled,
						authErrorMessage: null,
						connectionMode: mode,
						gridColumns,
						imageCacheMaxBytes,
						isAuthRequired,
						serverUrlPrefill: rememberedServerUrl,
						trackCacheMaxTracks,
					});
					this.applyNativeTrackCacheLimit(trackCacheMaxTracks);
				},
			)
			.catch(() => {
				if (!this.state.isBootstrapped) {
					this.initUserStores('shared');
					this.transport = new OfflineTransport(this.downloadService);
					this.completeBootstrap({ connectionMode: ConnectionModes.offline });
				}
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
			this.syncScrobblePlaybackSnapshot();
			this.handleAlbumChange();
			this.handleTrackPlaybackSourceChange();
			this.handleTrackPrefetchQueueChange();
			this.syncTrackPlaybackNotification();
			this.setState({ version: this.state.version + 1 });
		});
		this.syncScrobblePlaybackSnapshot();
		// Handle any track already playing at startup
		this.handleAlbumChange();
		this.handleTrackPlaybackSourceChange();
		this.handleTrackPrefetchQueueChange();
		this.syncTrackPlaybackNotification();
		this.refreshTrackCachedCount();
	}

	onDestroy(): void {
		if (this.bootstrapCommitTimer) {
			clearTimeout(this.bootstrapCommitTimer);
		}
		if (this.authToastTimer) {
			clearTimeout(this.authToastTimer);
		}
		if (this.playbackToastTimer) {
			clearTimeout(this.playbackToastTimer);
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
		if (this.nativeCacheStatsInterval) {
			clearInterval(this.nativeCacheStatsInterval);
		}
		if (this.nativePlaybackActionInterval) {
			clearInterval(this.nativePlaybackActionInterval);
		}
		clearAtollaTrackPlaybackNotification();
		this.trackPrefetchQueue.clearQueue();
		if (this.paletteQueue) {
			this.paletteQueue.dispose();
		}
	}

	private initUserStores(userId: string): void {
		if (this.unsubscribePalette) {
			this.unsubscribePalette();
		}
		this.searchStore = new SearchStore(
			new PersistentStore(`atolla/user/${userId}/search_history`, { deviceGlobal: true }),
		);
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
				if (!this.transport.scrobbleTrackPlayed) {
					return Promise.reject(new Error('scrobble delivery unavailable'));
				}
				return this.transport.scrobbleTrackPlayed(pending.trackId, pending.triggeredAt);
			},
			store: new PersistentStore(`atolla/user/${userId}/pending_scrobbles`, {
				deviceGlobal: true,
			}),
		});
		this.syncScrobblePlaybackSnapshot();
		void this.scrobbleService.onAppReady();
		try {
			setAtollaImageCachedObserver((url, category) => {
				if (category !== 'album_art' || this.paletteService.hasPalette(url)) {
					return;
				}
				this.paletteQueue.enqueue(url);
			});
		} catch {
			// Observer bridge unavailable on non-Android targets.
		}
		this.unsubscribePalette = this.paletteService.subscribe(() => {
			this.setState({ version: this.state.version + 1 });
		});
	}

	private showAuthToast(message: string): void {
		if (this.authToastTimer) {
			clearTimeout(this.authToastTimer);
		}
		this.setState({ authToastMessage: message });
		this.authToastTimer = setTimeout(() => {
			this.setState({ authToastMessage: null });
		}, 2500);
	}

	private showPlaybackToast(message: string): void {
		if (this.playbackToastTimer) {
			clearTimeout(this.playbackToastTimer);
		}
		this.setState({ playbackToastMessage: message });
		this.playbackToastTimer = setTimeout(() => {
			this.setState({ playbackToastMessage: null });
		}, 3000);
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

				this.transport = new LiveTransport(session.serverUrl, session.accessToken, session.userId);
				this.initUserStores(session.userId);

				this.setState({
					authErrorMessage: null,
					connectionMode: ConnectionModes.online,
					isAuthenticating: false,
					isAuthRequired: false,
					quickConnectCode: null,
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

	handleModeChange = (mode: ConnectionMode): void => {
		void (async () => {
			this.pendingNavRestoreContext = this.currentHomeNavContext;
			await this.preferences.setMode(mode);
			this.authService.setMockMode(mode === ConnectionModes.mock);

			if (mode === ConnectionModes.online) {
				const session = await this.authService.loadSession();
				if (session != null) {
					this.transport = new LiveTransport(
						session.serverUrl,
						session.accessToken,
						session.userId,
					);
				} else {
					this.setState({ connectionMode: mode, isAuthRequired: true });
					return;
				}
			} else if (mode === ConnectionModes.offline) {
				this.transport = new OfflineTransport(this.downloadService);
			} else {
				this.transport = new MockTransport();
			}

			this.setState({ connectionMode: mode, isAuthRequired: false });
		})();
	};

	handleLogout = (): void => {
		void (async () => {
			try {
				await this.authService.clearSession();
			} catch {
				// best effort — clear what we can
			}
			this.transport = new OfflineTransport(this.downloadService);
			this.playbackStore.stop();
			this.setState({
				authErrorMessage: null,
				connectionMode: ConnectionModes.online,
				isAuthenticating: false,
				isAuthRequired: true,
				quickConnectCode: null,
				serverUrlPrefill: '',
			});
			this.showAuthToast('logged out');
		})();
	};

	private refreshNativeCacheStats(): void {
		try {
			const nativeImageCacheDiskCount = getAtollaImageLoaderDiskCacheEntryCount();
			const nativeImageCacheDiskBytes = getAtollaImageLoaderDiskCacheByteSize();
			if (
				this.state.nativeImageCacheDiskCount === nativeImageCacheDiskCount &&
				this.state.nativeImageCacheDiskBytes === nativeImageCacheDiskBytes
			) {
				return;
			}
			this.setState({
				nativeImageCacheDiskBytes,
				nativeImageCacheDiskCount,
			});
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
		void this.paletteService.warmUp([imageUrl]).then(() => {
			if (!this.paletteService.hasPalette(imageUrl)) {
				this.paletteQueue.prioritize(imageUrl);
			}
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

	private handleTrackCached(trackId: string): void {
		this.lastTrackFetchErrorTrackId = null;
		this.refreshTrackCachedCount();

		if (this.playbackStore.track?.id !== trackId) {
			return;
		}

		if (this.state.trackPlaybackSourceUrl == null) {
			this.handleTrackPlaybackSourceChange(true);
		}
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

	private handleTrackPlaybackSourceChange(force = false): void {
		const activeTrack = this.playbackStore.track;

		if (!activeTrack) {
			this.lastPlaybackDebugProbeKey = 'none';
			this.playbackSourceRequestId += 1;
			this.lastTrackSourceTrackId = null;
			if (this.state.trackPlaybackSourceUrl != null) {
				this.setState({ trackPlaybackSourceUrl: null });
			}
			return;
		}

		const playbackState = this.playbackStore.isPlaying ? 'playing' : 'paused';
		const sourceState = this.state.trackPlaybackSourceUrl ? 'has-source' : 'no-source';
		const probeKey = `${activeTrack.id}|${playbackState}|${sourceState}`;
		this.lastPlaybackDebugProbeKey = probeKey;

		if (!force && this.lastTrackSourceTrackId === activeTrack.id) {
			const shouldRetryForMissingSource =
				this.playbackStore.isPlaying && this.state.trackPlaybackSourceUrl == null;
			if (!shouldRetryForMissingSource) {
				return;
			}
		}

		this.lastTrackSourceTrackId = activeTrack.id;
		const requestId = this.playbackSourceRequestId + 1;
		this.playbackSourceRequestId = requestId;
		const nativeSource = this.getNativeCachedTrackSource(activeTrack.id);
		if (nativeSource) {
			if (this.state.trackPlaybackSourceUrl !== nativeSource) {
				this.setState({ trackPlaybackSourceUrl: nativeSource });
			}
			return;
		}

		const streamUrl = this.getTrackStreamSource(activeTrack.id);
		if (streamUrl && this.state.trackPlaybackSourceUrl !== streamUrl) {
			this.setState({ trackPlaybackSourceUrl: streamUrl });
		}

		if (this.playbackStore.isPlaying && !this.isOfflinePlaybackMode()) {
			void this.downloadCurrentTrackForPlayback(activeTrack.id, requestId, streamUrl);
		}
	}

	private isOfflinePlaybackMode(): boolean {
		return this.state.connectionMode === ConnectionModes.offline;
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
				this.showPlaybackToast('cache download failed: no url');
				this.handleTrackCacheFetchFailed(trackId, 'no url');
				return;
			}

			cacheAtollaTrackFromUrlAsync(trackId, url, (rawSource) => {
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

				this.showPlaybackToast('cache download failed: native cache failed');
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
		const url = this.transport.getTrackCacheUrl?.(trackId) ?? null;
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
			nowPlayingCollapseSignal: this.state.nowPlayingCollapseSignal + 1,
			searchFocusSignal:
				tab === FooterTabs.search ? this.state.searchFocusSignal + 1 : this.state.searchFocusSignal,
		});

		if (tab === FooterTabs.settings) {
			this.refreshNativeCacheStats();
		}
	};

	handleHomeHeaderTabTap = (tab: HeaderTab): void => {
		this.returnToSearchOnDetailClose = false;
		if (tab === this.state.activeHomeTab) {
			this.setState({
				homeResetNonce: this.state.homeResetNonce + 1,
			});
			return;
		}

		this.setState({
			activeHomeTab: tab,
		});
	};

	handleClearCache = (selection: ClearCacheSelection): void => {
		const categories: Array<string> = [];
		if (selection.albumArt) categories.push('album_art');
		if (selection.albumArtBlurred) categories.push('album_art_blurred');
		if (selection.artistImage) categories.push('artist_image');
		if (selection.artistLogo) categories.push('artist_logo');
		if (selection.playlistImage) categories.push('playlist_image');
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
			this.setState({ trackPlaybackSourceUrl: null });
			this.handleTrackPrefetchQueueChange(true);
		}
		this.refreshNativeCacheStats();
		this.refreshTrackCachedCount();
		this.setState({ version: this.state.version + 1 });
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

	handleHomeNavigationControllerChange = (navigationController: NavigationController): void => {
		this.homeNavigationController = navigationController;
		this.tryNavigatePendingArtist();
		this.tryNavigatePendingAlbum();
		this.tryNavigatePendingSearchResult();
		this.tryRestoreNavContext();
	};

	handleNavigationContext = (context: HomeNavContext | null): void => {
		this.currentHomeNavContext = context;
	};

	private tryRestoreNavContext(): void {
		const context = this.pendingNavRestoreContext;
		if (!context || !this.homeNavigationController) {
			return;
		}
		this.pendingNavRestoreContext = null;

		const nav = this.homeNavigationController;
		const { animationsEnabled, gridColumns } = this.state;
		const shared = {
			animationsEnabled,
			downloadService: this.downloadService,
			gridColumns,
			onNavigationContext: this.handleNavigationContext,
			paletteQueue: this.paletteQueue,
			playbackStore: this.playbackStore,
			transport: this.transport,
		};

		if (context.kind === 'artist') {
			this.transport.getArtist(context.artist.id).then((artist) => {
				if (!nav) return;
				nav.push(
					ArtistView,
					{ ...shared, artist: artist ?? context.artist },
					{},
					{ animated: false },
				);
				this.currentHomeNavContext = { artist: artist ?? context.artist, kind: 'artist' };
			});
		} else if (context.kind === 'album') {
			nav.push(AlbumView, { ...shared, album: context.album }, {}, { animated: false });
			this.currentHomeNavContext = context;
		} else if (context.kind === 'playlist') {
			nav.push(PlaylistView, { ...shared, playlist: context.playlist }, {}, { animated: false });
			this.currentHomeNavContext = context;
		}
	}

	handleSearchResultNavigation = (target: SearchHomeNavigationTarget): void => {
		this.pendingSearchNavigation = target;
		this.returnToSearchOnDetailClose = true;

		const activeHomeTab =
			target.kind === 'album'
				? HeaderTabs.albums
				: target.kind === 'artist'
					? HeaderTabs.artists
					: HeaderTabs.playlists;

		this.setState({
			activeFooterTab: FooterTabs.home,
			activeHomeTab,
			homeResetNonce: this.state.homeResetNonce + 1,
		});

		this.tryNavigatePendingSearchResult();
	};

	private handleSearchNavigationDetailExit = (): void => {
		if (!this.returnToSearchOnDetailClose) {
			return;
		}

		if (this.state.activeFooterTab !== FooterTabs.home) {
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
			!this.homeNavigationController ||
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

			if (!this.homeNavigationController) {
				this.isResolvingSearchNavigation = false;
				return;
			}

			if (target.kind === 'artist') {
				this.homeNavigationController.push(
					ArtistView,
					{
						animationsEnabled: this.state.animationsEnabled,
						artist: target.artist,
						downloadService: this.downloadService,
						gridColumns: this.state.gridColumns,
						onExitFromSearchNavigation: this.handleSearchNavigationDetailExit,
						paletteQueue: this.paletteQueue,
						playbackStore: this.playbackStore,
						transport: this.transport,
					},
					{},
					{ animated: this.state.animationsEnabled },
				);
			}

			if (target.kind === 'album') {
				this.homeNavigationController.push(
					AlbumView,
					{
						album: target.album as Album,
						animationsEnabled: this.state.animationsEnabled,
						downloadService: this.downloadService,
						gridColumns: this.state.gridColumns,
						onExitFromSearchNavigation: this.handleSearchNavigationDetailExit,
						paletteQueue: this.paletteQueue,
						playbackStore: this.playbackStore,
						transport: this.transport,
					},
					{},
					{ animated: this.state.animationsEnabled },
				);
			}

			if (target.kind === 'playlist') {
				this.homeNavigationController.push(
					PlaylistView,
					{
						animationsEnabled: this.state.animationsEnabled,
						downloadService: this.downloadService,
						gridColumns: this.state.gridColumns,
						onExitFromSearchNavigation: this.handleSearchNavigationDetailExit,
						paletteQueue: this.paletteQueue,
						playbackStore: this.playbackStore,
						playlist: target.playlist as Playlist,
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
		this.playbackStore.previous();
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
		if (!this.homeNavigationController) {
			return;
		}
		const navigationController = this.homeNavigationController;
		this.transport.getArtist(artistId).then((artist) => {
			if (!artist) return;
			navigationController.push(
				ArtistView,
				{
					animationsEnabled: this.state.animationsEnabled,
					artist,
					downloadService: this.downloadService,
					gridColumns: this.state.gridColumns,
					paletteQueue: this.paletteQueue,
					playbackStore: this.playbackStore,
					transport: this.transport,
				},
				{},
				{ animated: this.state.animationsEnabled },
			);
		});
	};

	handleNowPlayingArtistTap = (): void => {
		const { album, artistLogoUrl, track } = this.playbackStore;
		const artistId = track?.artistId ?? album?.artistId;
		if (!artistId) {
			return;
		}

		this.pendingArtistId = artistId;
		this.pendingArtistFallbackName = track?.artistName ?? album?.artistName ?? 'Unknown Artist';
		this.pendingArtistFallbackLogoUrl = artistLogoUrl ?? null;
		this.setState({
			activeFooterTab: FooterTabs.home,
			activeHomeTab: HeaderTabs.artists,
			homeResetNonce: this.state.homeResetNonce + 1,
		});

		this.tryNavigatePendingArtist();
	};

	private tryNavigatePendingArtist(): void {
		if (
			!this.pendingArtistId ||
			!this.homeNavigationController ||
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
				this.homeNavigationController?.push(
					ArtistView,
					{
						animationsEnabled: this.state.animationsEnabled,
						artist: resolvedArtist,
						downloadService: this.downloadService,
						gridColumns: this.state.gridColumns,
						paletteQueue: this.paletteQueue,
						playbackStore: this.playbackStore,
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

	handleNowPlayingAlbumTap = (): void => {
		const { album, track } = this.playbackStore;
		const resolvedAlbum: Album | null =
			album ??
			(track?.albumId
				? {
						artistId: track.artistId ?? '',
						artistName: track.artistName ?? '',
						id: track.albumId,
						imageUrl: track.albumImageUrl,
						name: track.albumName ?? '',
					}
				: null);
		if (!resolvedAlbum) {
			return;
		}

		this.pendingAlbum = resolvedAlbum;
		this.setState({
			activeFooterTab: FooterTabs.home,
			activeHomeTab: HeaderTabs.albums,
			homeResetNonce: this.state.homeResetNonce + 1,
		});

		this.tryNavigatePendingAlbum();
	};

	private tryNavigatePendingAlbum(): void {
		if (!this.pendingAlbum || !this.homeNavigationController || this.isResolvingAlbumNavigation) {
			return;
		}

		this.isResolvingAlbumNavigation = true;
		const album = this.pendingAlbum;
		Promise.resolve().then(() => {
			if (this.pendingAlbum !== album) {
				this.isResolvingAlbumNavigation = false;
				return;
			}
			if (!this.homeNavigationController) {
				this.isResolvingAlbumNavigation = false;
				return;
			}
			this.homeNavigationController.push(
				AlbumView,
				{
					album,
					animationsEnabled: this.state.animationsEnabled,
					downloadService: this.downloadService,
					gridColumns: this.state.gridColumns,
					paletteQueue: this.paletteQueue,
					playbackStore: this.playbackStore,
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
				| 'serverUrlPrefill'
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

	onRender(): void {
		if (!this.state.isBootstrapped) {
			<BootSplash message='loading your library' />;
			return;
		}

		if (this.state.isAuthRequired) {
			<view style={styles.root}>
				<ConnectionView
					errorMessage={this.state.authErrorMessage}
					isConnecting={this.state.isAuthenticating}
					onConnect={this.handleConnect}
					quickConnectCode={this.state.quickConnectCode}
					serverUrl={this.state.serverUrlPrefill}
				/>
				{this.state.authToastMessage && <Toast message={this.state.authToastMessage} />}
			</view>;
			return;
		}

		const {
			track,
			album,
			isPlaying,
			loopMode,
			progressSeconds,
			artistLogoUrl,
			tracks,
			trackIndex,
		} = this.playbackStore;
		const palette = this.paletteService.getPalette(track?.albumImageUrl ?? album?.imageUrl);

		<view style={styles.root}>
			{this.state.connectionMode === ConnectionModes.mock ? (
				<MockPlayer playbackStore={this.playbackStore} />
			) : (
				<VideoAudioPlayer
					onPlaybackError={this.handlePlaybackError}
					onPlaybackEvent={this.handlePlaybackEvent}
					playbackSourceUrl={this.state.trackPlaybackSourceUrl}
					playbackStore={this.playbackStore}
				/>
			)}
			{this.state.activeFooterTab === FooterTabs.home && (
				<HomeHeaderNav
					activeTab={this.state.activeHomeTab}
					onTabTap={this.handleHomeHeaderTabTap}
				/>
			)}

			{this.state.activeFooterTab === FooterTabs.home && (
				<HomeView
					activeTab={this.state.activeHomeTab}
					animationsEnabled={this.state.animationsEnabled}
					connectionMode={this.state.connectionMode}
					downloadService={this.downloadService}
					gridColumns={this.state.gridColumns}
					onNavigateToArtist={this.handleNavigateToArtist}
					onNavigationContext={this.handleNavigationContext}
					onNavigationControllerChange={this.handleHomeNavigationControllerChange}
					paletteQueue={this.paletteQueue}
					playbackStore={this.playbackStore}
					resetSignal={this.state.homeResetNonce}
					transport={this.transport}
				/>
			)}
			{this.state.activeFooterTab === FooterTabs.search && (
				<NavigationRoot>
					{$slot((navigationController) => {
						<SearchView
							animationsEnabled={this.state.animationsEnabled}
							focusSignal={this.state.searchFocusSignal}
							gridColumns={this.state.gridColumns}
							navigationController={navigationController}
							onNavigateToHomeResult={this.handleSearchResultNavigation}
							paletteQueue={this.paletteQueue}
							playbackStore={this.playbackStore}
							searchStore={this.searchStore}
							transport={this.transport}
						/>;
					})}
				</NavigationRoot>
			)}
			{this.state.activeFooterTab === FooterTabs.settings && (
				<SettingsView
					animationsEnabled={this.state.animationsEnabled}
					downloadedSizeBytes={this.state.downloadedSizeBytes ?? undefined}
					downloadedTrackCount={this.state.downloadedTrackCount}
					gridColumns={this.state.gridColumns}
					imageCacheDiskBytes={this.state.nativeImageCacheDiskBytes ?? undefined}
					imageCacheDiskCount={this.state.nativeImageCacheDiskCount ?? undefined}
					imageCacheError={null}
					imageCacheMaxBytes={this.state.imageCacheMaxBytes}
					onAnimationsChange={this.handleAnimationsChange}
					onCacheSizeChange={this.handleCacheSizeChange}
					onClearCache={this.handleClearCache}
					onGridColumnsChange={this.handleGridColumnsChange}
					onLogout={this.handleLogout}
					onTrackCacheMaxTracksChange={this.handleTrackCacheMaxTracksChange}
					preferences={this.preferences}
					trackCacheCachedCount={this.state.trackPlaybackCachedCount}
					trackCacheMaxTracks={this.state.trackCacheMaxTracks}
				/>
			)}

			<FooterNav
				activeTab={this.state.activeFooterTab}
				connectionMode={this.state.connectionMode}
				downloadingCount={this.state.downloadingCount}
				onFooterTabTap={this.handleFooterTabTap}
				onModeChange={this.handleModeChange}
			/>

			{track && (
				<NowPlayingSurface
					album={album}
					animationsEnabled={this.state.animationsEnabled}
					artistLogoUrl={artistLogoUrl}
					collapseSignal={this.state.nowPlayingCollapseSignal}
					isPlaying={isPlaying}
					loopMode={loopMode}
					onAlbumTap={this.handleNowPlayingAlbumTap}
					onArtistTap={this.handleNowPlayingArtistTap}
					onDismiss={this.handleNowPlayingDismiss}
					onLoopModeToggle={this.handleNowPlayingLoopModeToggle}
					onNext={this.handleNowPlayingNext}
					onPlayPause={this.handleNowPlayingPlayPause}
					onPrevious={this.handleNowPlayingPrevious}
					onProgressTap={this.handleNowPlayingProgressTap}
					onTrackTap={this.handleNowPlayingTrackTap}
					palette={palette}
					playbackStore={this.playbackStore}
					progressSeconds={progressSeconds}
					track={track}
					trackIndex={trackIndex}
					tracks={tracks}
					transport={this.transport}
				/>
			)}

			{this.state.authToastMessage && <Toast message={this.state.authToastMessage} />}
			{this.state.playbackToastMessage && <Toast message={this.state.playbackToastMessage} />}
		</view>;
	}
}

const styles = {
	root: new Style({
		alignItems: 'center',
		backgroundColor: theme.colors.bg,
		height: '100%',
		justifyContent: 'flex-start',
		position: 'relative',
		width: '100%',
	}),
};
