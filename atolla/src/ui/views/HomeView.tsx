// @ts-nocheck

import { PersistentStore } from 'persistence/src/PersistentStore';
import { $slot } from 'valdi_core/src/CompilerIntrinsics';
import { StatefulComponent } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import { NavigationRoot } from 'valdi_navigation/src/NavigationRoot';
import { ImageCache, type ImageStore } from '../../services/ImageCache';
import type { PlaybackStore } from '../../stores/Playback';
import { DEFAULT_IMAGE_CACHE_MAX_BYTES } from '../../stores/Preferences';
import { theme } from '../../theme';
import { MockTransport } from '../../transports/Mock';
import { type HeaderTab, HeaderTabs } from '../components/HeaderTabs';
import { HomeHeaderNav } from '../components/HomeHeaderNav';
import { AlbumsView } from './AlbumsView';
import { ArtistsView } from './ArtistsView';
import { PlaylistsView } from './PlaylistsView';

let _imageCacheMaxBytes = DEFAULT_IMAGE_CACHE_MAX_BYTES;

export function setImageCacheSize(bytes: number): void {
	_imageCacheMaxBytes = bytes;
}

export interface HomeViewModel {
	animationsEnabled: boolean;
	playbackStore: PlaybackStore;
}

interface HomeState {
	activeTab: HeaderTab;
	navigationOverlayVisible: boolean;
	tabKeys: Record<HeaderTab, number>;
}

const noopStore: ImageStore = {
	exists: () => Promise.resolve(false),
	fetch: () => Promise.reject(new Error()),
	store: () => Promise.resolve(),
};

export class HomeView extends StatefulComponent<HomeViewModel, HomeState> {
	private transport = new MockTransport();
	private imageCache = (() => {
		try {
			return new ImageCache(new PersistentStore('image_cache', { maxWeight: _imageCacheMaxBytes }));
		} catch {
			return new ImageCache(noopStore);
		}
	})();

	state: HomeState = {
		activeTab: HeaderTabs.artists,
		navigationOverlayVisible: true,
		tabKeys: {
			[HeaderTabs.artists]: 0,
			[HeaderTabs.albums]: 0,
			[HeaderTabs.playlists]: 0,
		},
	};

	onCreate(): void {
		Promise.resolve().then(() => {
			this.setState({ navigationOverlayVisible: false });
		});
	}

	handleHeaderTabTap = (tab: HeaderTab): void => {
		if (tab === this.state.activeTab) {
			this.setState({ tabKeys: { ...this.state.tabKeys, [tab]: this.state.tabKeys[tab] + 1 } });
		} else {
			this.setState({ activeTab: tab });
		}
	};

	onRender(): void {
		const { animationsEnabled, playbackStore } = this.viewModel;

		<view style={styles.root}>
			<HomeHeaderNav activeTab={this.state.activeTab} onTabTap={this.handleHeaderTabTap} />
			{this.state.navigationOverlayVisible && <view style={styles.navigationOverlay} />}

			{this.state.activeTab === HeaderTabs.artists && (
				<NavigationRoot key={this.state.tabKeys[HeaderTabs.artists]}>
					{$slot((navigationController) => {
						<ArtistsView
							animationsEnabled={animationsEnabled}
							imageCache={this.imageCache}
							navigationController={navigationController}
							playbackStore={playbackStore}
							transport={this.transport}
						/>;
					})}
				</NavigationRoot>
			)}
			{this.state.activeTab === HeaderTabs.albums && (
				<NavigationRoot key={this.state.tabKeys[HeaderTabs.albums]}>
					{$slot((navigationController) => {
						<AlbumsView
							animationsEnabled={animationsEnabled}
							imageCache={this.imageCache}
							navigationController={navigationController}
							playbackStore={playbackStore}
							transport={this.transport}
						/>;
					})}
				</NavigationRoot>
			)}
			{this.state.activeTab === HeaderTabs.playlists && (
				<NavigationRoot key={this.state.tabKeys[HeaderTabs.playlists]}>
					{$slot((navigationController) => {
						<PlaylistsView
							animationsEnabled={animationsEnabled}
							navigationController={navigationController}
							playbackStore={playbackStore}
							transport={this.transport}
						/>;
					})}
				</NavigationRoot>
			)}
		</view>;
	}
}

const styles = {
	navigationOverlay: new Style({
		backgroundColor: theme.colors.bg,
		bottom: 0,
		left: 0,
		position: 'absolute',
		right: 0,
		top: 0,
	}),
	root: new Style({
		flexGrow: 1,
		width: '100%',
	}),
};
