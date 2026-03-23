// @ts-nocheck
import { PersistentStore } from 'persistence/src/PersistentStore';
import { AssetOutputType, addAssetLoadObserver } from 'valdi_core/src/Asset';
import { StatefulComponent } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import { ErrorConst } from './errors/Const';
import { PaletteGenerationErrors } from './errors/PaletteGenerationErrors';
import {
	ensureAtollaImageLoaderBootstrap,
	extractAtollaPaletteFromCache,
	getAtollaImageLoaderCacheByteSize,
	getAtollaImageLoaderCacheEntryCount,
} from './ImageLoaderBootstrap';
import { ArtworkPaletteService } from './services/ArtworkPaletteService';
import { mutedTextColor } from './services/color/colorUtils';
import type { Palette } from './services/color/types';
import { ImageCache } from './services/ImageCache';
import { buildImageSource } from './services/ImageSource';
import { PersistentPaletteStore } from './services/PersistentPaletteStore';
import { PlaybackStore } from './stores/Playback';
import { DEFAULT_IMAGE_CACHE_MAX_BYTES, Preferences } from './stores/Preferences';
import { theme } from './theme';
import { MockTransport } from './transports/Mock';
import { FooterNav } from './ui/components/FooterNav';
import { type FooterTab, FooterTabs } from './ui/components/FooterTab';
import { type HeaderTab, HeaderTabs } from './ui/components/HeaderTabs';
import { HomeHeaderNav } from './ui/components/HomeHeaderNav';
import { NowPlayingSurface } from './ui/components/NowPlayingSurface';
import { HomeView, setImageCacheSize } from './ui/views/HomeView';
import { SearchView } from './ui/views/SearchView';
import { SettingsView } from './ui/views/SettingsView';

export type AppViewModel = Record<string, never>;

interface AppState {
	activeFooterTab: FooterTab;
	activeHomeTab: HeaderTab;
	animationsEnabled: boolean;
	homeResetNonce: number;
	imageCacheMaxBytes: number;
	nativeImageCacheBufferedBytes: number | null;
	nativeImageCacheBufferedCount: number | null;
	nowPlayingCollapseSignal: number;
	paletteFailureCount: number;
	paletteFailureDetails: Array<string>;
	paletteFailureSummary: string | null;
	paletteProcessedCount: number;
	// null = not yet triggered; number = total artwork URLs queued for generation
	paletteTotalCount: number | null;
	version: number;
}

export class App extends StatefulComponent<AppViewModel, AppState> {
	private playbackStore = new PlaybackStore();
	private preferences = new Preferences();
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

	state: AppState = {
		activeFooterTab: FooterTabs.home,
		activeHomeTab: HeaderTabs.artists,
		animationsEnabled: true,
		homeResetNonce: 0,
		imageCacheMaxBytes: DEFAULT_IMAGE_CACHE_MAX_BYTES,
		nativeImageCacheBufferedBytes: null,
		nativeImageCacheBufferedCount: null,
		nowPlayingCollapseSignal: 0,
		paletteFailureCount: 0,
		paletteFailureDetails: [],
		paletteFailureSummary: null,
		paletteProcessedCount: 0,
		paletteTotalCount: null,
		version: 0,
	};

	onCreate(): void {
		try {
			ensureAtollaImageLoaderBootstrap();
			this.refreshNativeCacheStats();
			this.nativeCacheStatsInterval = setInterval(() => {
				this.refreshNativeCacheStats();
			}, 1000);
		} catch {
			// Android native bootstrap may be unavailable on non-Android targets.
		}
		this.preferences.getImageCacheMaxBytes().then((bytes) => {
			setImageCacheSize(bytes);
			this.setState({ imageCacheMaxBytes: bytes });
		});
		this.preferences.getAnimationsEnabled().then((enabled) => {
			this.setState({ animationsEnabled: enabled });
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
			this.playbackStore.album?.imageUrl ?? this.playbackStore.track?.albumImageUrl ?? null;
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
			if (!parsed.primary?.hex || !parsed.surface?.hex || !parsed.on_surface?.hex) {
				return null;
			}
			const mutedOnSurfaceHex =
				parsed.muted_on_surface?.hex ??
				mutedTextColor({ hex: parsed.on_surface.hex }, { hex: parsed.surface.hex }).hex;
			const accentHex = parsed.accent?.hex ?? parsed.primary.hex;
			return {
				accent: { hex: accentHex },
				muted_on_surface: { hex: mutedOnSurfaceHex },
				on_surface: { hex: parsed.on_surface.hex },
				primary: { hex: parsed.primary.hex },
				surface: { hex: parsed.surface.hex },
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
					resolve({ buffer, mimeType: this.detectMimeType(bytes, url) });
				},
				AssetOutputType.BYTES,
			);
		});
	}

	private detectMimeType(bytes: Uint8Array, url: string): string {
		if (
			bytes.length >= 8 &&
			bytes[0] === 0x89 &&
			bytes[1] === 0x50 &&
			bytes[2] === 0x4e &&
			bytes[3] === 0x47 &&
			bytes[4] === 0x0d &&
			bytes[5] === 0x0a &&
			bytes[6] === 0x1a &&
			bytes[7] === 0x0a
		)
			return 'image/png';

		if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
			return 'image/jpeg';

		if (
			bytes.length >= 12 &&
			bytes[0] === 0x52 &&
			bytes[1] === 0x49 &&
			bytes[2] === 0x46 &&
			bytes[3] === 0x46 &&
			bytes[8] === 0x57 &&
			bytes[9] === 0x45 &&
			bytes[10] === 0x42 &&
			bytes[11] === 0x50
		)
			return 'image/webp';

		if (
			bytes.length >= 4 &&
			bytes[0] === 0x47 &&
			bytes[1] === 0x49 &&
			bytes[2] === 0x46 &&
			bytes[3] === 0x38
		)
			return 'image/gif';

		const lower = url.toLowerCase();
		if (lower.includes('.png')) return 'image/png';
		if (lower.includes('.webp')) return 'image/webp';
		if (lower.includes('.gif')) return 'image/gif';
		return 'image/jpeg';
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
			await this.paletteService.warmUp(urls);
			for (const url of urls) {
				try {
					if (this.paletteService.hasPalette(url)) {
						continue;
					}
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
		this.setState({
			activeFooterTab: tab,
			nowPlayingCollapseSignal: this.state.nowPlayingCollapseSignal + 1,
		});
	};

	handleHomeHeaderTabTap = (tab: HeaderTab): void => {
		if (tab === this.state.activeHomeTab) {
			this.setState({
				homeResetNonce: this.state.homeResetNonce + 1,
			});
			return;
		}

		this.setState({
			activeHomeTab: tab,
			homeResetNonce: this.state.homeResetNonce + 1,
		});
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

	onRender(): void {
		const { track, album, isPlaying, progressSeconds, artistLogoUrl, tracks, trackIndex } =
			this.playbackStore;
		const palette = this.paletteService.getPalette(album?.imageUrl ?? track?.albumImageUrl);

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
					playbackStore={this.playbackStore}
					resetSignal={this.state.homeResetNonce}
				/>
			)}
			{this.state.activeFooterTab === FooterTabs.search && <SearchView />}
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
					onDismiss={() => this.playbackStore.stop()}
					onNext={() => this.playbackStore.next()}
					onPlayPause={() => this.playbackStore.playPause()}
					onPrevious={() => this.playbackStore.previous()}
					palette={palette}
					progressSeconds={progressSeconds}
					track={track}
					trackIndex={trackIndex}
					tracks={tracks}
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
