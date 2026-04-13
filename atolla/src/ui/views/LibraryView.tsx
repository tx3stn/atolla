// @ts-nocheck

import { $slot } from 'valdi_core/src/CompilerIntrinsics';
import { StatefulComponent } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { NavigationController } from 'valdi_navigation/src/NavigationController';
import { NavigationRoot } from 'valdi_navigation/src/NavigationRoot';
import type { Album } from '../../models/Album';
import type { Artist } from '../../models/Artist';
import type { Genre } from '../../models/Genre';
import type { Playlist } from '../../models/Playlist';
import type { DownloadService } from '../../services/DownloadService';
import type { PaletteGenerationQueue } from '../../services/PaletteGenerationQueue';
import type { PlaybackStore } from '../../stores/Playback';
import { theme } from '../../theme';
import { type ConnectionMode, ConnectionModes } from '../../transports/Model';
import type { Transport } from '../../transports/Transport';
import { type HeaderTab, HeaderTabs } from '../components/HeaderTabs';
import { AlbumsView } from './AlbumsView';
import { ArtistsView } from './ArtistsView';
import { GenresView } from './GenresView';
import { PlaylistsView } from './PlaylistsView';

export type LibraryNavContext =
	| { kind: 'artist'; artist: Artist }
	| { kind: 'album'; album: Album }
	| { genre: Genre; kind: 'genre' }
	| { kind: 'playlist'; playlist: Playlist };

export interface LibraryViewModel {
	activeTab: HeaderTab;
	animationsEnabled: boolean;
	connectionMode: ConnectionMode;
	downloadService: DownloadService;
	gridColumns: number;
	onHeaderVisibilityChange?: (isVisible: boolean) => void;
	onNavigateToArtist?: (artistId: string) => void;
	onNavigationContext?: (context: LibraryNavContext | null) => void;
	onNavigationControllerChange?: (navigationController: NavigationController) => void;
	paletteQueue?: PaletteGenerationQueue;
	playbackStore: PlaybackStore;
	resetSignal: number;
	transport: Transport;
}

interface LibraryState {
	isNavigationMounted: boolean;
	isTabTransitionOverlayVisible: boolean;
}

export class LibraryView extends StatefulComponent<LibraryViewModel, LibraryState> {
	private resetVersion = 0;
	private tabTransitionTimer?: ReturnType<typeof setTimeout>;
	private transitionVersion = 0;

	state: LibraryState = {
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

	onViewModelUpdate(prevViewModel?: LibraryViewModel): void {
		if (!prevViewModel) {
			return;
		}

		const activeTabChanged = this.viewModel.activeTab !== prevViewModel.activeTab;
		const connectionModeChanged = this.viewModel.connectionMode !== prevViewModel.connectionMode;
		if (activeTabChanged) {
			this.startTabTransitionOverlay();
		}

		if (
			!activeTabChanged &&
			!connectionModeChanged &&
			this.viewModel.resetSignal === prevViewModel.resetSignal
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
		const {
			activeTab,
			animationsEnabled,
			downloadService,
			gridColumns,
			imageCache,
			onNavigateToArtist,
			onHeaderVisibilityChange,
			onNavigationContext,
			paletteQueue,
			playbackStore,
		} = this.viewModel;
		const transport = this.viewModel.transport;
		const isOfflineMode = this.viewModel.connectionMode === ConnectionModes.offline;

		<view style={styles.root}>
			{this.state.isNavigationMounted && activeTab === HeaderTabs.artists && (
				<NavigationRoot>
					{$slot((navigationController) => {
						this.viewModel.onNavigationControllerChange?.(navigationController);
						<ArtistsView
							animationsEnabled={animationsEnabled}
							downloadService={downloadService}
							gridColumns={gridColumns}
							imageCache={imageCache}
							isOfflineMode={isOfflineMode}
							navigationController={navigationController}
							onHeaderVisibilityChange={onHeaderVisibilityChange}
							onNavigationContext={onNavigationContext}
							paletteQueue={paletteQueue}
							playbackStore={playbackStore}
							transport={transport}
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
							downloadService={downloadService}
							gridColumns={gridColumns}
							imageCache={imageCache}
							isOfflineMode={isOfflineMode}
							navigationController={navigationController}
							onHeaderVisibilityChange={onHeaderVisibilityChange}
							onNavigationContext={onNavigationContext}
							paletteQueue={paletteQueue}
							playbackStore={playbackStore}
							transport={transport}
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
							downloadService={downloadService}
							gridColumns={gridColumns}
							imageCache={imageCache}
							navigationController={navigationController}
							onHeaderVisibilityChange={onHeaderVisibilityChange}
							onNavigateToArtist={onNavigateToArtist}
							onNavigationContext={onNavigationContext}
							paletteQueue={paletteQueue}
							playbackStore={playbackStore}
							transport={transport}
						/>;
					})}
				</NavigationRoot>
			)}

			{this.state.isNavigationMounted && activeTab === HeaderTabs.genres && (
				<NavigationRoot>
					{$slot((navigationController) => {
						this.viewModel.onNavigationControllerChange?.(navigationController);
						<GenresView
							animationsEnabled={animationsEnabled}
							downloadService={downloadService}
							gridColumns={gridColumns}
							imageCache={imageCache}
							navigationController={navigationController}
							onHeaderVisibilityChange={onHeaderVisibilityChange}
							onNavigateToArtist={onNavigateToArtist}
							onNavigationContext={onNavigationContext}
							playbackStore={playbackStore}
							transport={transport}
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
