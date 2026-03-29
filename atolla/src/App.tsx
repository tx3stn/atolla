// @ts-nocheck
import { PersistentStore } from 'persistence/src/PersistentStore';
import { AssetOutputType, addAssetLoadObserver } from 'valdi_core/src/Asset';
import { $slot } from 'valdi_core/src/CompilerIntrinsics';
import { StatefulComponent } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { NavigationController } from 'valdi_navigation/src/NavigationController';
import { NavigationRoot } from 'valdi_navigation/src/NavigationRoot';
import { ErrorConst } from './errors/Const';
import { PaletteGenerationErrors } from './errors/PaletteGenerationErrors';
import {
	clearAtollaNativeCacheCategories,
	ensureAtollaImageLoaderBootstrap,
	extractAtollaPaletteFromCache,
	getAtollaImageLoaderCacheByteSize,
	getAtollaImageLoaderCacheEntryCount,
} from './ImageLoaderBootstrap';
import { detectMimeType } from './images/MimeType';
import type { Album } from './models/Album';
import type { Artist } from './models/Artist';
import type { Playlist } from './models/Playlist';
import { ArtworkPaletteService } from './services/ArtworkPaletteService';
import { legibleTextColor, mutedTextColor, mutedVariant } from './services/color/colorUtils';
import type { Palette } from './services/color/types';
import { type ClearCacheSelection, ImageCache } from './services/ImageCache';
import { buildImageSource } from './services/ImageSource';
import { PersistentPaletteStore } from './services/PersistentPaletteStore';
import { PlaybackStore } from './stores/Playback';
import { DEFAULT_IMAGE_CACHE_MAX_BYTES, Preferences } from './stores/Preferences';
import { SearchStore } from './stores/Search';
import { theme } from './theme';
import { MockTransport } from './transports/Mock';
import { BootSplash } from './ui/components/BootSplash';
import { FooterNav } from './ui/components/FooterNav';
import { type FooterTab, FooterTabs } from './ui/components/FooterTab';
import { type HeaderTab, HeaderTabs } from './ui/components/HeaderTabs';
import { HomeHeaderNav } from './ui/components/HomeHeaderNav';
import { NowPlayingSurface } from './ui/components/NowPlayingSurface';
import { AlbumView } from './ui/views/AlbumView';
import { ArtistView } from './ui/views/ArtistView';
import { HomeView, setImageCacheSize } from './ui/views/HomeView';
import { PlaylistView } from './ui/views/PlaylistView';
import { type SearchHomeNavigationTarget, SearchView } from './ui/views/SearchView';
import { SettingsView } from './ui/views/SettingsView';

try {
	ensureAtollaImageLoaderBootstrap();
} catch {
	// Android native bootstrap may be unavailable on non-Android targets.
}

export type AppViewModel = Record<string, never>;

interface AppState {
	activeFooterTab: FooterTab;
	activeHomeTab: HeaderTab;
	animationsEnabled: boolean;
	homeResetNonce: number;
	imageCacheMaxBytes: number;
	isBootstrapped: boolean;
	nativeImageCacheBufferedBytes: number | null;
	nativeImageCacheBufferedCount: number | null;
	nowPlayingCollapseSignal: number;
	paletteFailureCount: number;
	paletteFailureDetails: Array<string>;
	paletteFailureSummary: string | null;
	paletteProcessedCount: number;
	// null = not yet triggered; number = total artwork URLs queued for generation
	paletteTotalCount: number | null;
	searchFocusSignal: number;
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
	private transport = new MockTransport();
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
	private unsubscribePlayback?: () => void;
	private unsubscribePalette?: () => void;
	private nativeCacheStatsInterval?: ReturnType<typeof setInterval>;
	private lastArtworkUrl: string | null = null;
	private homeNavigationController?: NavigationController;
	private pendingArtistId: string | null = null;
	private pendingArtistFallbackName: string = 'Unknown Artist';
	private pendingArtistFallbackLogoUrl: string | null = null;
	private isResolvingArtistNavigation = false;
	private pendingSearchNavigation: SearchHomeNavigationTarget | null = null;
	private isResolvingSearchNavigation = false;
	private returnToSearchOnDetailClose = false;
	private readonly minimumBootSplashMs = 700;
	private bootstrapStartedAt = Date.now();
	private bootstrapCommitTimer?: ReturnType<typeof setTimeout>;

	state: AppState = {
		activeFooterTab: FooterTabs.home,
		activeHomeTab: HeaderTabs.artists,
		animationsEnabled: true,
		homeResetNonce: 0,
		imageCacheMaxBytes: DEFAULT_IMAGE_CACHE_MAX_BYTES,
		isBootstrapped: false,
		nativeImageCacheBufferedBytes: null,
		nativeImageCacheBufferedCount: null,
		nowPlayingCollapseSignal: 0,
		paletteFailureCount: 0,
		paletteFailureDetails: [],
		paletteFailureSummary: null,
		paletteProcessedCount: 0,
		paletteTotalCount: null,
		searchFocusSignal: 0,
		version: 0,
	};

	onCreate(): void {
		this.bootstrapStartedAt = Date.now();
		this.nativeCacheStatsInterval = setInterval(() => {
			if (this.state.activeFooterTab === FooterTabs.settings) {
				this.refreshNativeCacheStats();
			}
		}, 1000);
		Promise.all([this.preferences.getImageCacheMaxBytes(), this.preferences.getAnimationsEnabled()])
			.then(([imageCacheMaxBytes, animationsEnabled]) => {
				setImageCacheSize(imageCacheMaxBytes);
				this.completeBootstrap({
					animationsEnabled,
					imageCacheMaxBytes,
				});
			})
			.catch(() => {
				if (!this.state.isBootstrapped) {
					this.completeBootstrap({});
				}
			});
		this.unsubscribePlayback = this.playbackStore.subscribe(() => {
			this.handleAlbumChange();
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
		this.unsubscribePlayback?.();
		this.unsubscribePalette?.();
		if (this.nativeCacheStatsInterval) {
			clearInterval(this.nativeCacheStatsInterval);
		}
	}

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
	// palette exists, generates one from the fetched buffer.
	private handleAlbumChange(): void {
		const imageUrl =
			this.playbackStore.track?.albumImageUrl ?? this.playbackStore.album?.imageUrl ?? null;
		if (!imageUrl || imageUrl === this.lastArtworkUrl) return;
		this.lastArtworkUrl = imageUrl;
		void (async () => {
			await this.paletteService.warmUp([imageUrl]);
			if (this.paletteService.getPalette(imageUrl).primary.hex !== '#d8dee9') return;
			try {
				await this.generatePaletteForUrl(imageUrl);
			} catch {
				// Best effort on playback change.
			}
		})();
	}

	// Extract palette from native atolla-cache loader in cache-only mode.
	// Throws a typed palette generation error when bytes are unavailable or decode/persist fails.
	private async generatePaletteForUrl(url: string): Promise<boolean> {
		const nativePalette = this.extractNativePalette(url, 'album_art');
		if (nativePalette) {
			await this.paletteService.persistPalette(url, nativePalette);
			return true;
		}

		const entry = await this.loadCachedNativeBuffer(url, 'album_art');
		if (!entry) {
			throw PaletteGenerationErrors.CACHE_MISS;
		}
		await this.paletteService.generatePalette(url, entry.buffer, entry.mimeType);
		if (!this.paletteService.hasPalette(url)) {
			throw {
				detail: this.paletteService.lastError ?? PaletteGenerationErrors.EXTRACTION_FAILED.msg(),
				error: PaletteGenerationErrors.EXTRACTION_FAILED,
			};
		}
		return true;
	}

	private extractNativePalette(
		url: string,
		category: 'album_art' | 'artist_image' | 'artist_logo' | 'playlist_image',
	): Palette | null {
		try {
			const raw = extractAtollaPaletteFromCache(url, category);
			if (!raw) return null;
			const parsed = JSON.parse(raw) as Partial<Palette>;
			if (!parsed.primary?.hex) {
				return null;
			}
			const primary = { hex: parsed.primary.hex };
			const surface = mutedVariant(primary);
			const onSurface = legibleTextColor(surface);
			const mutedOnSurfaceHex = mutedTextColor(onSurface, surface).hex;
			const accentHex = parsed.accent?.hex ?? parsed.primary.hex;
			return {
				accent: { hex: accentHex },
				muted_on_surface: { hex: mutedOnSurfaceHex },
				on_surface: onSurface,
				primary,
				surface,
			};
		} catch {
			return null;
		}
	}

	private loadCachedNativeBuffer(
		url: string,
		category: 'album_art' | 'artist_image' | 'artist_logo' | 'playlist_image',
	): Promise<{ buffer: ArrayBuffer; mimeType: string } | null> {
		const source = buildImageSource(url, category, { cacheOnly: true });
		return new Promise((resolve) => {
			let subscription: { unsubscribe(): void } | undefined;
			subscription = addAssetLoadObserver(
				source,
				(loadedAsset: unknown, error: string | undefined) => {
					subscription?.unsubscribe();
					if (error || !loadedAsset) {
						resolve(null);
						return;
					}
					const bytes = loadedAsset as Uint8Array;
					const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
					resolve({ buffer, mimeType: detectMimeType(bytes, url) });
				},
				AssetOutputType.BYTES,
			);
		});
	}

	private withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				reject({
					detail: `timeout after ${timeoutMs}ms`,
					error: PaletteGenerationErrors.TIMEOUT,
				});
			}, timeoutMs);
			promise.then(
				(value) => {
					clearTimeout(timer);
					resolve(value);
				},
				(error) => {
					clearTimeout(timer);
					reject(error);
				},
			);
		});
	}

	private paletteFailureCode(error: unknown): string {
		if (error instanceof ErrorConst) {
			return error.err;
		}
		if (error && typeof error === 'object') {
			const withError = error as { error?: unknown };
			if (withError.error instanceof ErrorConst) {
				return withError.error.err;
			}
		}
		return PaletteGenerationErrors.UNKNOWN.err;
	}

	private paletteFailureDetail(error: unknown): string {
		if (error instanceof ErrorConst) {
			return error.msg();
		}
		if (error && typeof error === 'object') {
			const withError = error as { detail?: unknown; error?: unknown };
			if (typeof withError.detail === 'string') {
				return withError.detail;
			}
			if (withError.error instanceof ErrorConst) {
				return withError.error.msg();
			}
		}
		if (error instanceof Error) {
			return error.message;
		}
		return PaletteGenerationErrors.UNKNOWN.msg();
	}

	private buildPaletteFailureSummary(
		failureCounts: Map<string, number>,
		failureDetails: Map<string, string>,
	): string | null {
		if (failureCounts.size === 0) {
			return null;
		}
		const parts = Array.from(failureCounts.entries())
			.sort((a, b) => b[1] - a[1])
			.map(([code, count]) => {
				const detail = failureDetails.get(code);
				if (!detail) {
					return `${code}: ${count}`;
				}
				return `${code}: ${count} (${detail})`;
			});
		return `Failures by reason -> ${parts.join(' | ')}`;
	}

	handleGeneratePalettes = (): void => {
		void (async () => {
			const albums = await this.transport.getAllAlbums();
			const urls = [...new Set(albums.map((a) => a.imageUrl).filter(Boolean))];
			let processed = 0;
			let failures = 0;
			const failureDetailsList: Array<string> = [];
			const failureCounts = new Map<string, number>();
			const failureDetails = new Map<string, string>();
			this.setState({
				paletteFailureCount: failures,
				paletteFailureDetails: [],
				paletteFailureSummary: null,
				paletteProcessedCount: 0,
				paletteTotalCount: urls.length,
			});
			for (const url of urls) {
				try {
					await this.withTimeout(this.generatePaletteForUrl(url), 12000);
				} catch (error) {
					failures += 1;
					const code = this.paletteFailureCode(error);
					const detail = this.paletteFailureDetail(error);
					failureDetailsList.push(`${code} | ${detail} | ${url}`);
					failureCounts.set(code, (failureCounts.get(code) ?? 0) + 1);
					if (!failureDetails.has(code)) {
						failureDetails.set(code, detail);
					}
				} finally {
					processed += 1;
					this.setState({
						paletteFailureCount: failures,
						paletteFailureDetails: failureDetailsList,
						paletteFailureSummary: this.buildPaletteFailureSummary(failureCounts, failureDetails),
						paletteProcessedCount: processed,
					});
				}
			}
		})();
	};

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

	handleHomeNavigationControllerChange = (navigationController: NavigationController): void => {
		this.homeNavigationController = navigationController;
		this.tryNavigatePendingArtist();
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

	private completeBootstrap(
		partialState: Partial<Pick<AppState, 'animationsEnabled' | 'imageCacheMaxBytes'>>,
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

		const { track, album, isPlaying, progressSeconds, artistLogoUrl, tracks, trackIndex } =
			this.playbackStore;
		const palette = this.paletteService.getPalette(track?.albumImageUrl ?? album?.imageUrl);

		<view style={styles.root}>
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
					playbackStore={this.playbackStore}
					resetSignal={this.state.homeResetNonce}
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
					onGeneratePalettes={this.handleGeneratePalettes}
					paletteCount={this.paletteService.cacheSize}
					paletteError={this.paletteService.lastError}
					paletteFailureCount={this.state.paletteFailureCount}
					paletteFailureDetails={this.state.paletteFailureDetails}
					paletteFailureSummary={this.state.paletteFailureSummary}
					paletteProcessedCount={this.state.paletteProcessedCount}
					paletteTotalCount={this.state.paletteTotalCount}
					preferences={this.preferences}
				/>
			)}

			<FooterNav
				activeTab={this.state.activeFooterTab}
				onFooterTabTap={this.handleFooterTabTap}
				preferences={this.preferences}
			/>

			{track && (
				<NowPlayingSurface
					album={album}
					animationsEnabled={this.state.animationsEnabled}
					artistLogoUrl={artistLogoUrl}
					collapseSignal={this.state.nowPlayingCollapseSignal}
					imageCache={this.imageCache}
					isPlaying={isPlaying}
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
