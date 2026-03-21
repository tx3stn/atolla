// @ts-nocheck
import { StatefulComponent } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import { PlaybackStore } from './stores/Playback';
import { DEFAULT_IMAGE_CACHE_MAX_BYTES, Preferences } from './stores/Preferences';
import { theme } from './theme';
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
	version: number;
}

export class App extends StatefulComponent<AppViewModel, AppState> {
	private playbackStore = new PlaybackStore();
	private preferences = new Preferences();
	private unsubscribePlayback?: () => void;

	state: AppState = {
		activeFooterTab: FooterTabs.home,
		activeHomeTab: HeaderTabs.artists,
		animationsEnabled: true,
		homeResetNonce: 0,
		imageCacheMaxBytes: DEFAULT_IMAGE_CACHE_MAX_BYTES,
		nowPlayingCollapseSignal: 0,
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
			this.setState({ version: this.state.version + 1 });
		});
	}

	onDestroy(): void {
		this.unsubscribePlayback?.();
	}

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
		const { track, album, isPlaying, progressSeconds, artistLogoUrl } = this.playbackStore;

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
					playbackStore={this.playbackStore}
					resetSignal={this.state.homeResetNonce}
				/>
			)}
			{this.state.activeFooterTab === FooterTabs.search && <SearchView />}
			{this.state.activeFooterTab === FooterTabs.settings && (
				<SettingsView
					animationsEnabled={this.state.animationsEnabled}
					imageCacheMaxBytes={this.state.imageCacheMaxBytes}
					onAnimationsChange={this.handleAnimationsChange}
					onCacheSizeChange={this.handleCacheSizeChange}
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
					progressSeconds={progressSeconds}
					track={track}
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
