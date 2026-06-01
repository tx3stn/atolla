import { $slot } from 'valdi_core/src/CompilerIntrinsics';
import { StatefulComponent } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';
import type { NavigationController } from 'valdi_navigation/src/NavigationController';
import { NavigationRoot } from 'valdi_navigation/src/NavigationRoot';
import type { View } from 'valdi_tsx/src/NativeTemplateElements';
import type { Album } from '../../models/Album';
import type { Artist } from '../../models/Artist';
import type { Genre } from '../../models/Genre';
import type { Playlist } from '../../models/Playlist';
import type { DownloadService } from '../../services/DownloadService';
import type { ImageCache } from '../../services/ImageCache';
import type { PaletteGenerationQueue } from '../../services/PaletteGenerationQueue';
import type { PlaylistEditService } from '../../services/PlaylistEditService';
import type { PlaybackStore } from '../../stores/Playback';
import { theme } from '../../theme';
import { type ConnectionMode, ConnectionModes } from '../../transports/Model';
import type { Transport } from '../../transports/Transport';
import { type HeaderTab, HeaderTabs } from '../components/HeaderTabs';
import type { SortOrder } from '../components/SortNavPanel';
import type { ToastService } from '../components/ToastService';
import type { NavBarContext } from '../NavBarContext';
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
	imageCache: ImageCache;
	letterFilter?: string | null;
	modalSlot?: DetachedSlot;
	navBarContext?: NavBarContext;
	onHeaderVisibilityChange?: (isVisible: boolean) => void;
	onNavigateToArtist?: (artistId: string) => void;
	onNavigationContext?: (context: LibraryNavContext | null) => void;
	onNavigationControllerChange?: (navigationController: NavigationController) => void;
	paletteQueue?: PaletteGenerationQueue;
	playbackStore: PlaybackStore;
	playlistEditService: PlaylistEditService;
	resetSignal: number;
	sortOrder?: SortOrder;
	toastService: ToastService;
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
			letterFilter,
			modalSlot,
			navBarContext,
			onNavigateToArtist,
			onHeaderVisibilityChange,
			onNavigationContext,
			paletteQueue,
			playbackStore,
			sortOrder,
		} = this.viewModel;
		const transport = this.viewModel.transport;
		const toastService = this.viewModel.toastService;
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
							letterFilter={letterFilter}
							modalSlot={modalSlot}
							navBarContext={navBarContext}
							navigationController={navigationController}
							onHeaderVisibilityChange={onHeaderVisibilityChange}
							onNavigationContext={onNavigationContext}
							paletteQueue={paletteQueue}
							playbackStore={playbackStore}
							sortOrder={sortOrder}
							toastService={toastService}
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
							letterFilter={letterFilter}
							modalSlot={modalSlot}
							navBarContext={navBarContext}
							navigationController={navigationController}
							onHeaderVisibilityChange={onHeaderVisibilityChange}
							onNavigationContext={onNavigationContext}
							paletteQueue={paletteQueue}
							playbackStore={playbackStore}
							sortOrder={sortOrder}
							toastService={toastService}
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
							letterFilter={letterFilter}
							modalSlot={modalSlot}
							navBarContext={navBarContext}
							navigationController={navigationController}
							onHeaderVisibilityChange={onHeaderVisibilityChange}
							onNavigateToArtist={onNavigateToArtist}
							onNavigationContext={onNavigationContext}
							paletteQueue={paletteQueue}
							playbackStore={playbackStore}
							playlistEditService={this.viewModel.playlistEditService}
							sortOrder={sortOrder}
							toastService={toastService}
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
							letterFilter={letterFilter}
							modalSlot={modalSlot}
							navBarContext={navBarContext}
							navigationController={navigationController}
							onHeaderVisibilityChange={onHeaderVisibilityChange}
							onNavigateToArtist={onNavigateToArtist}
							onNavigationContext={onNavigationContext}
							playbackStore={playbackStore}
							toastService={toastService}
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
	root: new Style<View>({
		flexGrow: 1,
		width: '100%',
	}),
	tabTransitionOverlay: new Style<View>({
		backgroundColor: theme.colors.bg,
		bottom: 0,
		left: 0,
		position: 'absolute',
		right: 0,
		top: 0,
		zIndex: 20,
	}),
};
