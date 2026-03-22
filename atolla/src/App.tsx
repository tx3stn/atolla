// @ts-nocheck
import { PersistentStore } from 'persistence/src/PersistentStore';
import { StatefulComponent } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import { ArtworkPaletteService } from './services/ArtworkPaletteService';
import { ImageCache } from './services/ImageCache';
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
	nowPlayingCollapseSignal: number;
	paletteFailureCount: number;
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
	private unsubscribeImageCache?: () => void;
	private lastArtworkUrl: string | null = null;

	state: AppState = {
		activeFooterTab: FooterTabs.home,
		activeHomeTab: HeaderTabs.artists,
		animationsEnabled: true,
		homeResetNonce: 0,
		imageCacheMaxBytes: DEFAULT_IMAGE_CACHE_MAX_BYTES,
		nowPlayingCollapseSignal: 0,
		paletteFailureCount: 0,
		paletteTotalCount: null,
		version: 0,
	};

	onCreate(): void {
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
		this.unsubscribeImageCache = this.imageCache.subscribe(() => {
			this.setState({ version: this.state.version + 1 });
		});
		// Handle any track already playing at startup
		this.handleAlbumChange();
	}

	onDestroy(): void {
		this.unsubscribePlayback?.();
		this.unsubscribePalette?.();
		this.unsubscribeImageCache?.();
	}

	// Called whenever the playback store changes. Loads the persisted palette
	// immediately (warmUp) and prefetches the image for display. If no persisted
	// palette exists, generates one from the fetched buffer.
	private handleAlbumChange(): void {
		const imageUrl = this.playbackStore.album?.imageUrl ?? null;
		if (!imageUrl || imageUrl === this.lastArtworkUrl) return;
		this.lastArtworkUrl = imageUrl;
		void (async () => {
			await this.paletteService.warmUp([imageUrl]);
			if (this.paletteService.getPalette(imageUrl).primary.hex !== '#d8dee9') return;
			await this.generatePaletteForUrl(imageUrl);
		})();
	}

	// Extract palette from a URL that is already in the image buffer cache.
	// If the image hasn't been loaded into the buffer cache yet, skips silently.
	private async generatePaletteForUrl(url: string): Promise<void> {
		const entry = this.imageCache.getBuffer(url);
		if (!entry) return;
		await this.paletteService.generatePalette(url, entry.buffer, entry.mimeType);
	}

	handleGeneratePalettes = (): void => {
		void (async () => {
			const albums = await this.transport.getAllAlbums();
			const urls = [...new Set(albums.map((a) => a.imageUrl).filter(Boolean))];
			this.setState({ paletteFailureCount: 0, paletteTotalCount: urls.length });
			await this.paletteService.warmUp(urls);
			await this.imageCache.prefetch(urls);
			for (const url of urls) {
				try {
					await this.generatePaletteForUrl(url);
				} catch {
					this.setState({ paletteFailureCount: this.state.paletteFailureCount + 1 });
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
		const palette = this.paletteService.getPalette(album?.imageUrl);

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
					imageCacheBufferedBytes={this.imageCache.bufferedBytes}
					imageCacheBufferedCount={this.imageCache.bufferedCount}
					imageCacheError={this.imageCache.lastError}
					imageCacheMaxBytes={this.state.imageCacheMaxBytes}
					onAnimationsChange={this.handleAnimationsChange}
					onCacheSizeChange={this.handleCacheSizeChange}
					onGeneratePalettes={this.handleGeneratePalettes}
					paletteCount={this.paletteService.cacheSize}
					paletteError={this.paletteService.lastError}
					paletteFailureCount={this.state.paletteFailureCount}
					paletteTotalCount={this.state.paletteTotalCount}
					preferences={this.preferences}
				/>
			)}

			<FooterNav
				activeTab={this.state.activeFooterTab}
				onFooterTabTap={this.handleFooterTabTap}
				preferences={this.preferences}
			/>

			{track && album && (
				<NowPlayingSurface
					album={album}
					animationsEnabled={this.state.animationsEnabled}
					artistLogoUrl={artistLogoUrl}
					collapseSignal={this.state.nowPlayingCollapseSignal}
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
