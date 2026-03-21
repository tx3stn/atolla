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
import { AlbumsView } from './AlbumsView';
import { ArtistsView } from './ArtistsView';
import { PlaylistsView } from './PlaylistsView';

let _imageCacheMaxBytes = DEFAULT_IMAGE_CACHE_MAX_BYTES;

export function setImageCacheSize(bytes: number): void {
	_imageCacheMaxBytes = bytes;
}

export interface HomeViewModel {
	activeTab: HeaderTab;
	animationsEnabled: boolean;
	playbackStore: PlaybackStore;
	resetSignal: number;
}

interface HomeState {
	isNavigationMounted: boolean;
	navigationOverlayVisible: boolean;
}

const noopStore: ImageStore = {
	exists: () => Promise.resolve(false),
	fetch: () => Promise.reject(new Error()),
	store: () => Promise.resolve(),
};

export class HomeView extends StatefulComponent<HomeViewModel, HomeState> {
	private transport = new MockTransport();
	private resetVersion = 0;
	private imageCache = (() => {
		try {
			return new ImageCache(new PersistentStore('image_cache', { maxWeight: _imageCacheMaxBytes }));
		} catch {
			return new ImageCache(noopStore);
		}
	})();

	state: HomeState = {
		isNavigationMounted: false,
		navigationOverlayVisible: true,
	};

	onCreate(): void {
		this.resetNavigationRoot();
	}

	onViewModelUpdate(prevViewModel?: HomeViewModel): void {
		if (!prevViewModel) {
			this.resetNavigationRoot();
			return;
		}

		if (
			this.viewModel.resetSignal === prevViewModel.resetSignal &&
			this.viewModel.activeTab === prevViewModel.activeTab
		) {
			return;
		}

		this.resetNavigationRoot();
	}

	private resetNavigationRoot(): void {
		const nextResetVersion = this.resetVersion + 1;
		this.resetVersion = nextResetVersion;

		this.setState({
			isNavigationMounted: false,
			navigationOverlayVisible: true,
		});

		Promise.resolve().then(() => {
			if (this.resetVersion !== nextResetVersion) {
				return;
			}

			this.setState({
				isNavigationMounted: true,
				navigationOverlayVisible: false,
			});
		});
	}

	onRender(): void {
		const { activeTab, animationsEnabled, playbackStore } = this.viewModel;

		<view style={styles.root}>
			{this.state.navigationOverlayVisible && <view style={styles.navigationOverlay} />}

			{this.state.isNavigationMounted && activeTab === HeaderTabs.artists && (
				<NavigationRoot>
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

			{this.state.isNavigationMounted && activeTab === HeaderTabs.albums && (
				<NavigationRoot>
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

			{this.state.isNavigationMounted && activeTab === HeaderTabs.playlists && (
				<NavigationRoot>
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
