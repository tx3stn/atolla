// @ts-nocheck
import { PersistentStore } from 'persistence/src/PersistentStore';
import { $slot } from 'valdi_core/src/CompilerIntrinsics';
import { StatefulComponent } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { NavigationController } from 'valdi_navigation/src/NavigationController';
import { NavigationRoot } from 'valdi_navigation/src/NavigationRoot';
import { AuthErrors } from './errors/AuthErrors';
import {
	clearAtollaNativeCacheCategories,
	ensureAtollaImageLoaderBootstrap,
	getAtollaImageLoaderCacheByteSize,
	getAtollaImageLoaderCacheEntryCount,
} from './ImageLoaderBootstrap';
import type { Album } from './models/Album';
import type { Artist } from './models/Artist';
import type { Playlist } from './models/Playlist';
import { ArtworkPaletteService } from './services/ArtworkPaletteService';
import { type ClearCacheSelection, ImageCache } from './services/ImageCache';
import { type AuthSession, JellyfinAuthService } from './services/JellyfinAuthService';
import { PaletteGenerationQueue } from './services/PaletteGenerationQueue';
import { PersistentPaletteStore } from './services/PersistentPaletteStore';
import { TrackPlaybackCache } from './services/TrackPlaybackCache';
import { TrackPlaybackPrefetchQueue } from './services/TrackPlaybackPrefetchQueue';
import { PlaybackStore } from './stores/Playback';
import {
	DEFAULT_IMAGE_CACHE_MAX_BYTES,
	DEFAULT_TRACK_CACHE_MAX_TRACKS,
	Preferences,
} from './stores/Preferences';
import { SearchStore } from './stores/Search';
import { theme } from './theme';
import { LiveTransport } from './transports/Live';
import { MockTransport } from './transports/Mock';
import { type ConnectionMode, ConnectionModes } from './transports/Model';
import type { Transport } from './transports/Transport';
import { BootSplash } from './ui/components/BootSplash';
import { FooterNav } from './ui/components/FooterNav';
import { type FooterTab, FooterTabs } from './ui/components/FooterTab';
import { type HeaderTab, HeaderTabs } from './ui/components/HeaderTabs';
import { HomeHeaderNav } from './ui/components/HomeHeaderNav';
import { MockPlayer } from './ui/components/MockPlayer';
import { NowPlayingSurface } from './ui/components/NowPlayingSurface';
import { Toast } from './ui/components/Toast';
import { AlbumView } from './ui/views/AlbumView';
import { ArtistView } from './ui/views/ArtistView';
import { ConnectionView } from './ui/views/ConnectionView';
import { HomeView, setImageCacheSize } from './ui/views/HomeView';
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
	homeResetNonce: number;
	imageCacheMaxBytes: number;
	isAuthenticating: boolean;
	isAuthRequired: boolean;
	isBootstrapped: boolean;
	nativeImageCacheBufferedBytes: number | null;
	nativeImageCacheBufferedCount: number | null;
	nowPlayingCollapseSignal: number;
	quickConnectCode: string | null;
	searchFocusSignal: number;
	serverUrlPrefill: string;
	trackCacheMaxTracks: number;
	version: number;
}

export class App extends StatefulComponent<AppViewModel, AppState> {
	private playbackStore = new PlaybackStore();
	private preferences = new Preferences();
	private searchStore = new SearchStore(
		new PersistentStore('search_history', {
			deviceGlobal: true,
		}),
	);
	private transport: Transport = new MockTransport();
	private imageCache = (() => {
		try {
			return new ImageCache(
				new PersistentStore('image_cache', { maxWeight: DEFAULT_IMAGE_CACHE_MAX_BYTES }),
			);
		} catch {
			return new ImageCache({
				exists: () => Promise.resolve(false),
				fetch: () => Promise.reject(new Error()),
				store: () => Promise.resolve(),
			});
		}
	})();
	private paletteService = new ArtworkPaletteService(new PersistentPaletteStore());
	private paletteQueue = new PaletteGenerationQueue(this.paletteService);
	private trackPlaybackCache = new TrackPlaybackCache();
	private trackPlaybackPrefetchQueue = new TrackPlaybackPrefetchQueue(
		this.trackPlaybackCache,
		(track) => this.transport.getTrackCacheUrl?.(track.id) ?? null,
	);
	private authService = new JellyfinAuthService();
	private unsubscribePlayback?: () => void;
	private unsubscribePalette?: () => void;
	private authToastTimer?: ReturnType<typeof setTimeout>;
	private nativeCacheStatsInterval?: ReturnType<typeof setInterval>;
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
	private readonly minimumBootSplashMs = 750;
	private bootstrapStartedAt = Date.now();
	private bootstrapCommitTimer?: ReturnType<typeof setTimeout>;
	private lastTrackCacheQueueKey = '';

	state: AppState = {
		activeFooterTab: FooterTabs.home,
		activeHomeTab: HeaderTabs.artists,
		animationsEnabled: true,
		authErrorMessage: null,
		authToastMessage: null,
		connectionMode: ConnectionModes.mock,
		homeResetNonce: 0,
		imageCacheMaxBytes: DEFAULT_IMAGE_CACHE_MAX_BYTES,
		isAuthenticating: false,
		isAuthRequired: false,
		isBootstrapped: false,
		nativeImageCacheBufferedBytes: null,
		nativeImageCacheBufferedCount: null,
		nowPlayingCollapseSignal: 0,
		quickConnectCode: null,
		searchFocusSignal: 0,
		serverUrlPrefill: '',
		trackCacheMaxTracks: DEFAULT_TRACK_CACHE_MAX_TRACKS,
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
		Promise.all([
			this.preferences.getImageCacheMaxBytes(),
			this.preferences.getAnimationsEnabled(),
			this.preferences.getMode(),
			this.preferences.getTrackCacheMaxTracks(),
			this.authService.loadSession(),
			this.authService.loadRememberedServerUrl(),
		])
			.then(
				([
					imageCacheMaxBytes,
					animationsEnabled,
					mode,
					trackCacheMaxTracks,
					existingSession,
					rememberedServerUrl,
				]) => {
					this.authService.setMockMode(mode === ConnectionModes.mock);
					setImageCacheSize(imageCacheMaxBytes);
					this.trackPlaybackCache.configureMaxTracks(trackCacheMaxTracks);

					if (mode === ConnectionModes.online && existingSession != null) {
						this.transport = new LiveTransport(
							existingSession.serverUrl,
							existingSession.accessToken,
							existingSession.userId,
						);
					}

					const isAuthRequired = mode === ConnectionModes.online && existingSession == null;

					this.completeBootstrap({
						animationsEnabled,
						authErrorMessage: null,
						connectionMode: mode,
						imageCacheMaxBytes,
						isAuthRequired,
						serverUrlPrefill: rememberedServerUrl,
						trackCacheMaxTracks,
					});
				},
			)
			.catch(() => {
				if (!this.state.isBootstrapped) {
					this.completeBootstrap({});
				}
			});
		this.unsubscribePlayback = this.playbackStore.subscribe(() => {
			this.handleAlbumChange();
			this.handleTrackCacheQueueChange();
			this.setState({ version: this.state.version + 1 });
		});
		this.unsubscribePalette = this.paletteService.subscribe(() => {
			this.setState({ version: this.state.version + 1 });
		});
		// Handle any track already playing at startup
		this.handleAlbumChange();
	}

	onDestroy(): void {
		if (this.bootstrapCommitTimer) {
			clearTimeout(this.bootstrapCommitTimer);
		}
		if (this.authToastTimer) {
			clearTimeout(this.authToastTimer);
		}
		this.unsubscribePlayback?.();
		this.unsubscribePalette?.();
		if (this.nativeCacheStatsInterval) {
			clearInterval(this.nativeCacheStatsInterval);
		}
		this.paletteQueue.dispose();
		this.trackPlaybackPrefetchQueue.clearQueue();
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
			this.transport = new MockTransport();
			this.playbackStore.stop();
			this.setState({
				authErrorMessage: null,
				connectionMode: ConnectionModes.mock,
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
			const nativeImageCacheBufferedCount = getAtollaImageLoaderCacheEntryCount();
			const nativeImageCacheBufferedBytes = getAtollaImageLoaderCacheByteSize();
			if (
				this.state.nativeImageCacheBufferedCount === nativeImageCacheBufferedCount &&
				this.state.nativeImageCacheBufferedBytes === nativeImageCacheBufferedBytes
			) {
				return;
			}
			this.setState({
				nativeImageCacheBufferedBytes,
				nativeImageCacheBufferedCount,
			});
		} catch {
			// Native cache stats unavailable on non-Android targets.
		}
	}

	// Called whenever the playback store changes. Loads the persisted palette
	// immediately (warmUp) and prefetches the image for display. If no persisted
	// When the playing track changes, warm up any persisted palette and queue generation if needed.
	private handleAlbumChange(): void {
		const imageUrl =
			this.playbackStore.track?.albumImageUrl ?? this.playbackStore.album?.imageUrl ?? null;
		if (!imageUrl || imageUrl === this.lastArtworkUrl) return;
		this.lastArtworkUrl = imageUrl;
		void this.paletteService.warmUp([imageUrl]).then(() => {
			if (!this.paletteService.hasPalette(imageUrl)) {
				this.paletteQueue.prioritize(imageUrl);
			}
		});
	}

	private handleTrackCacheQueueChange(): void {
		const { track, trackIndex, tracks } = this.playbackStore;

		if (!track || tracks.length === 0) {
			this.lastTrackCacheQueueKey = '';
			this.trackPlaybackPrefetchQueue.clearQueue();
			return;
		}

		const queueKey = tracks.map((item) => item.id).join('|');
		if (queueKey !== this.lastTrackCacheQueueKey) {
			this.lastTrackCacheQueueKey = queueKey;
			this.trackPlaybackPrefetchQueue.replaceQueue(tracks, trackIndex);
			return;
		}

		this.trackPlaybackPrefetchQueue.prioritize(track);
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
		void this.imageCache.clearSelected(selection);
		try {
			clearAtollaNativeCacheCategories(categories);
		} catch {
			// Native clear unavailable on non-Android targets.
		}
		this.refreshNativeCacheStats();
		this.setState({ version: this.state.version + 1 });
	};

	handleCacheSizeChange = (bytes: number): void => {
		this.preferences.setImageCacheMaxBytes(bytes);
		setImageCacheSize(bytes);
		this.setState({ imageCacheMaxBytes: bytes });
	};

	handleAnimationsChange = (enabled: boolean): void => {
		this.preferences.setAnimationsEnabled(enabled);
		this.setState({ animationsEnabled: enabled });
	};

	handleTrackCacheMaxTracksChange = (count: number): void => {
		this.preferences.setTrackCacheMaxTracks(count);
		this.trackPlaybackCache.configureMaxTracks(count);
		this.setState({ trackCacheMaxTracks: count });
	};

	handleHomeNavigationControllerChange = (navigationController: NavigationController): void => {
		this.homeNavigationController = navigationController;
		this.tryNavigatePendingArtist();
		this.tryNavigatePendingAlbum();
		this.tryNavigatePendingSearchResult();
	};

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
						imageCache: this.imageCache,
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
						imageCache: this.imageCache,
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
						imageCache: this.imageCache,
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
					imageCache: this.imageCache,
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
						imageCache: this.imageCache,
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
					imageCache: this.imageCache,
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
		}, remaining);
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

		const { track, album, isPlaying, progressSeconds, artistLogoUrl, tracks, trackIndex } =
			this.playbackStore;
		const palette = this.paletteService.getPalette(track?.albumImageUrl ?? album?.imageUrl);

		<view style={styles.root}>
			<MockPlayer playbackStore={this.playbackStore} />
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
					imageCache={this.imageCache}
					onNavigateToArtist={this.handleNavigateToArtist}
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
							imageCache={this.imageCache}
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
					imageCacheBufferedBytes={
						this.state.nativeImageCacheBufferedBytes ?? this.imageCache.bufferedBytes
					}
					imageCacheBufferedCount={
						this.state.nativeImageCacheBufferedCount ?? this.imageCache.bufferedCount
					}
					imageCacheError={this.imageCache.lastError}
					imageCacheMaxBytes={this.state.imageCacheMaxBytes}
					onAnimationsChange={this.handleAnimationsChange}
					onCacheSizeChange={this.handleCacheSizeChange}
					onClearCache={this.handleClearCache}
					onLogout={this.handleLogout}
					onTrackCacheMaxTracksChange={this.handleTrackCacheMaxTracksChange}
					preferences={this.preferences}
					trackCacheMaxTracks={this.state.trackCacheMaxTracks}
				/>
			)}

			<FooterNav
				activeTab={this.state.activeFooterTab}
				connectionMode={this.state.connectionMode}
				onFooterTabTap={this.handleFooterTabTap}
				onModeChange={this.handleModeChange}
			/>

			{track && (
				<NowPlayingSurface
					album={album}
					animationsEnabled={this.state.animationsEnabled}
					artistLogoUrl={artistLogoUrl}
					collapseSignal={this.state.nowPlayingCollapseSignal}
					imageCache={this.imageCache}
					isPlaying={isPlaying}
					onAlbumTap={this.handleNowPlayingAlbumTap}
					onArtistTap={this.handleNowPlayingArtistTap}
					onDismiss={this.handleNowPlayingDismiss}
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
