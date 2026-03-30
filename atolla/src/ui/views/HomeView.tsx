// @ts-nocheck

import { $slot } from 'valdi_core/src/CompilerIntrinsics';
import { StatefulComponent } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { NavigationController } from 'valdi_navigation/src/NavigationController';
import { NavigationRoot } from 'valdi_navigation/src/NavigationRoot';
import type { ImageCache } from '../../services/ImageCache';
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
	imageCache: ImageCache;
	onNavigateToArtist?: (artistId: string) => void;
	onNavigationControllerChange?: (navigationController: NavigationController) => void;
	playbackStore: PlaybackStore;
	resetSignal: number;
}

interface HomeState {
	isNavigationMounted: boolean;
	isTabTransitionOverlayVisible: boolean;
}

export class HomeView extends StatefulComponent<HomeViewModel, HomeState> {
	private transport = new MockTransport();
	private resetVersion = 0;
	private tabTransitionTimer?: ReturnType<typeof setTimeout>;
	private transitionVersion = 0;

	state: HomeState = {
		isNavigationMounted: false,
		isTabTransitionOverlayVisible: true,
	};

	onCreate(): void {
		this.resetNavigationRoot();
	}

	onDestroy(): void {
		if (this.tabTransitionTimer) {
			clearTimeout(this.tabTransitionTimer);
		}
	}

	onViewModelUpdate(prevViewModel?: HomeViewModel): void {
		if (!prevViewModel) {
			return;
		}

		const activeTabChanged = this.viewModel.activeTab !== prevViewModel.activeTab;
		if (activeTabChanged) {
			this.startTabTransitionOverlay();
		}

		if (!activeTabChanged && this.viewModel.resetSignal === prevViewModel.resetSignal) {
			return;
		}

		this.resetNavigationRoot();
	}

	private resetNavigationRoot(): void {
		const nextResetVersion = this.resetVersion + 1;
		this.resetVersion = nextResetVersion;

		this.setState({
			isNavigationMounted: false,
			isTabTransitionOverlayVisible: true,
		});

		Promise.resolve().then(() => {
			if (this.resetVersion !== nextResetVersion) {
				return;
			}

			this.setState({
				isNavigationMounted: true,
				isTabTransitionOverlayVisible: false,
			});
		});
	}

	private startTabTransitionOverlay(): void {
		this.transitionVersion += 1;
		const version = this.transitionVersion;
		if (this.tabTransitionTimer) {
			clearTimeout(this.tabTransitionTimer);
		}

		if (!this.state.isTabTransitionOverlayVisible) {
			this.setState({ isTabTransitionOverlayVisible: true });
		}

		Promise.resolve().then(() => {
			if (version !== this.transitionVersion) {
				return;
			}

			this.tabTransitionTimer = setTimeout(
				() => {
					if (version !== this.transitionVersion) {
						return;
					}

					if (this.state.isTabTransitionOverlayVisible) {
						this.setState({ isTabTransitionOverlayVisible: false });
					}
				},
				this.viewModel.animationsEnabled ? 100 : 0,
			);
		});
	}

	onRender(): void {
		const { activeTab, animationsEnabled, imageCache, onNavigateToArtist, playbackStore } =
			this.viewModel;

		<view style={styles.root}>
			{this.state.isNavigationMounted && activeTab === HeaderTabs.artists && (
				<NavigationRoot>
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

			{this.state.isNavigationMounted && activeTab === HeaderTabs.albums && (
				<NavigationRoot>
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

			{this.state.isNavigationMounted && activeTab === HeaderTabs.playlists && (
				<NavigationRoot>
					{$slot((navigationController) => {
						this.viewModel.onNavigationControllerChange?.(navigationController);
						<PlaylistsView
							animationsEnabled={animationsEnabled}
							imageCache={imageCache}
							navigationController={navigationController}
							onNavigateToArtist={onNavigateToArtist}
							playbackStore={playbackStore}
							transport={this.transport}
						/>;
					})}
				</NavigationRoot>
			)}

			{this.state.isTabTransitionOverlayVisible && <view style={styles.tabTransitionOverlay} />}
		</view>;
	}
}

const styles = {
	root: new Style({
		flexGrow: 1,
		width: '100%',
	}),
	tabTransitionOverlay: new Style({
		backgroundColor: theme.colors.bg,
		bottom: 0,
		left: 0,
		position: 'absolute',
		right: 0,
		top: 0,
		zIndex: 20,
	}),
};
