// @ts-nocheck

import { $slot } from 'valdi_core/src/CompilerIntrinsics';
import { StatefulComponent } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { NavigationController } from 'valdi_navigation/src/NavigationController';
import { NavigationRoot } from 'valdi_navigation/src/NavigationRoot';
import type { ImageCache } from '../../services/ImageCache';
import type { PlaybackStore } from '../../stores/Playback';
import { DEFAULT_IMAGE_CACHE_MAX_BYTES } from '../../stores/Preferences';
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
	imageCache: ImageCache;
	onNavigationControllerChange?: (navigationController: NavigationController) => void;
	playbackStore: PlaybackStore;
	resetSignal: number;
}

interface HomeState {
	albumsNavKey: number;
	artistsNavKey: number;
	playlistsNavKey: number;
}

export class HomeView extends StatefulComponent<HomeViewModel, HomeState> {
	private transport = new MockTransport();

	state: HomeState = {
		albumsNavKey: 0,
		artistsNavKey: 0,
		playlistsNavKey: 0,
	};

	onCreate(): void {}

	onViewModelUpdate(prevViewModel?: HomeViewModel): void {
		if (!prevViewModel) {
			return;
		}

		if (this.viewModel.resetSignal === prevViewModel.resetSignal) {
			return;
		}

		if (this.viewModel.activeTab === HeaderTabs.albums) {
			this.setState({ albumsNavKey: this.state.albumsNavKey + 1 });
		}

		if (this.viewModel.activeTab === HeaderTabs.artists) {
			this.setState({ artistsNavKey: this.state.artistsNavKey + 1 });
		}

		if (this.viewModel.activeTab === HeaderTabs.playlists) {
			this.setState({ playlistsNavKey: this.state.playlistsNavKey + 1 });
		}
	}

	onRender(): void {
		const { activeTab, animationsEnabled, imageCache, playbackStore } = this.viewModel;

		<view style={styles.root}>
			{activeTab === HeaderTabs.artists && (
				<NavigationRoot key={`artists-nav-${this.state.artistsNavKey}`}>
					{$slot((navigationController) => {
						this.viewModel.onNavigationControllerChange?.(navigationController);
						<ArtistsView
							animationsEnabled={animationsEnabled}
							imageCache={imageCache}
							navigationController={navigationController}
							playbackStore={playbackStore}
							transport={this.transport}
						/>;
					})}
				</NavigationRoot>
			)}

			{activeTab === HeaderTabs.albums && (
				<NavigationRoot key={`albums-nav-${this.state.albumsNavKey}`}>
					{$slot((navigationController) => {
						this.viewModel.onNavigationControllerChange?.(navigationController);
						<AlbumsView
							animationsEnabled={animationsEnabled}
							imageCache={imageCache}
							navigationController={navigationController}
							playbackStore={playbackStore}
							transport={this.transport}
						/>;
					})}
				</NavigationRoot>
			)}

			{activeTab === HeaderTabs.playlists && (
				<NavigationRoot key={`playlists-nav-${this.state.playlistsNavKey}`}>
					{$slot((navigationController) => {
						this.viewModel.onNavigationControllerChange?.(navigationController);
						<PlaylistsView
							animationsEnabled={animationsEnabled}
							imageCache={imageCache}
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
	root: new Style({
		flexGrow: 1,
		width: '100%',
	}),
};
