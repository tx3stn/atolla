import { $slot } from 'valdi_core/src/CompilerIntrinsics';
import { StatefulComponent } from 'valdi_core/src/Component';
import { Device } from 'valdi_core/src/Device';
import { Style } from 'valdi_core/src/Style';
import type { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';
import type { NavigationController } from 'valdi_navigation/src/NavigationController';
import { NavigationRoot } from 'valdi_navigation/src/NavigationRoot';
import type { View } from 'valdi_tsx/src/NativeTemplateElements';
import type { Album } from '../../models/Album';
import { type HeaderTab, HeaderTabs } from '../../models/App';
import type { Artist } from '../../models/Artist';
import type { Playlist } from '../../models/Playlist';
import type { DownloadService } from '../../services/DownloadService';
import type { ImageCache } from '../../services/ImageCache';
import type { NavCoordinator } from '../../services/NavCoordinator';
import type { PaletteGenerationQueue } from '../../services/PaletteGenerationQueue';
import type { PlaylistEditService } from '../../services/PlaylistEditService';
import type { ToastService } from '../../services/ToastService';
import type { PlaybackStore } from '../../stores/Playback';
import { type ConnectionMode, ConnectionModes } from '../../transports/Model';
import type { Transport } from '../../transports/Transport';
import { Floating } from '../components/Floating';
import { LibraryHeaderNav } from '../components/LibraryHeaderNav';
import { AlbumsView } from '../views/AlbumsView';
import { AlbumView } from '../views/AlbumView';
import { ArtistsView } from '../views/ArtistsView';
import { ArtistView } from '../views/ArtistView';
import { GenresView } from '../views/GenresView';
import { PlaylistsView } from '../views/PlaylistsView';
import { PlaylistView } from '../views/PlaylistView';

export interface LibraryViewModel {
	animationsEnabled: boolean;
	connectionMode: ConnectionMode;
	downloadService: DownloadService;
	gridColumns: number;
	imageCache: ImageCache;
	modalSlot: DetachedSlot;
	navCoordinator: NavCoordinator;
	onNavigationControllerReady: (controller: NavigationController) => void;
	onRequestModeChange: (mode: ConnectionMode) => Promise<boolean>;
	paletteQueue: PaletteGenerationQueue;
	playbackStore: PlaybackStore;
	playlistEditService: PlaylistEditService;
	toastService: ToastService;
	transport: Transport;
}

interface LibraryViewState {
	activeTab: HeaderTab;
	letterFilter: string | null;
}

export class V2LibraryView extends StatefulComponent<LibraryViewModel, LibraryViewState> {
	private rootController?: NavigationController;
	private firstDetailController?: NavigationController;

	state: LibraryViewState = {
		activeTab: HeaderTabs.artists,
		letterFilter: null,
	};

	onCreate(): void {
		this.viewModel.navCoordinator.registerLibrary({
			showAlbum: this.showAlbum,
			showArtist: this.showArtist,
			showPlaylist: this.showPlaylist,
		});
	}

	onDestroy(): void {
		this.viewModel.navCoordinator.registerLibrary(null);
	}

	onRender(): void {
		const tab = this.state.activeTab;
		const isOfflineMode = this.viewModel.connectionMode === ConnectionModes.offline;
		<view style={styles.root}>
			<Floating>
				<LibraryHeaderNav
					activeTab={this.state.activeTab}
					animationsEnabled={this.viewModel.animationsEnabled}
					connectionMode={this.viewModel.connectionMode}
					onAlphabetLetterTap={this.handleFilterByLetter}
					onRequestModeChange={this.viewModel.onRequestModeChange}
					onTabTap={this.handleTabNavigation}
				/>
			</Floating>

			<view style={styles.tabHost}>
				<NavigationRoot>
					{$slot((navigationController: NavigationController) => {
						this.rootController = navigationController;
						this.viewModel.onNavigationControllerReady(navigationController);

						if (tab === HeaderTabs.artists) {
							<ArtistsView
								animationsEnabled={this.viewModel.animationsEnabled}
								downloadService={this.viewModel.downloadService}
								gridColumns={this.viewModel.gridColumns}
								imageCache={this.viewModel.imageCache}
								isOfflineMode={isOfflineMode}
								letterFilter={this.state.letterFilter}
								modalSlot={this.viewModel.modalSlot}
								navigationController={navigationController}
								onRootDetailControllerReady={this.setRootDetailController}
								paletteQueue={this.viewModel.paletteQueue}
								playbackStore={this.viewModel.playbackStore}
								toastService={this.viewModel.toastService}
								transport={this.viewModel.transport}
							/>;
						} else if (tab === HeaderTabs.albums) {
							<AlbumsView
								animationsEnabled={this.viewModel.animationsEnabled}
								downloadService={this.viewModel.downloadService}
								gridColumns={this.viewModel.gridColumns}
								imageCache={this.viewModel.imageCache}
								isOfflineMode={isOfflineMode}
								letterFilter={this.state.letterFilter}
								modalSlot={this.viewModel.modalSlot}
								navigationController={navigationController}
								onRootDetailControllerReady={this.setRootDetailController}
								paletteQueue={this.viewModel.paletteQueue}
								playbackStore={this.viewModel.playbackStore}
								toastService={this.viewModel.toastService}
								transport={this.viewModel.transport}
							/>;
						} else if (tab === HeaderTabs.playlists) {
							<PlaylistsView
								animationsEnabled={this.viewModel.animationsEnabled}
								downloadService={this.viewModel.downloadService}
								gridColumns={this.viewModel.gridColumns}
								imageCache={this.viewModel.imageCache}
								letterFilter={this.state.letterFilter}
								modalSlot={this.viewModel.modalSlot}
								navigationController={navigationController}
								onRootDetailControllerReady={this.setRootDetailController}
								paletteQueue={this.viewModel.paletteQueue}
								playbackStore={this.viewModel.playbackStore}
								playlistEditService={this.viewModel.playlistEditService}
								toastService={this.viewModel.toastService}
								transport={this.viewModel.transport}
							/>;
						} else {
							<GenresView
								animationsEnabled={this.viewModel.animationsEnabled}
								downloadService={this.viewModel.downloadService}
								gridColumns={this.viewModel.gridColumns}
								imageCache={this.viewModel.imageCache}
								letterFilter={this.state.letterFilter}
								modalSlot={this.viewModel.modalSlot}
								navigationController={navigationController}
								onRootDetailControllerReady={this.setRootDetailController}
								playbackStore={this.viewModel.playbackStore}
								toastService={this.viewModel.toastService}
								transport={this.viewModel.transport}
							/>;
						}
					})}
				</NavigationRoot>
			</view>
		</view>;
	}

	private handleFilterByLetter = (letter: string | null): void => {
		this.setState({ letterFilter: letter });
	};

	private handleTabNavigation = (tab: HeaderTab): void => {
		if (tab === this.state.activeTab) {
			return;
		}

		this.unwindToTabRoot();
		this.setState({ activeTab: tab });
	};

	private setRootDetailController = (controller: NavigationController): void => {
		this.firstDetailController = controller;
	};

	private showAlbum = (album: Album): void => {
		this.openDetail(HeaderTabs.albums, (controller) => this.pushAlbum(controller, album));
	};

	private showArtist = (artist: Artist): void => {
		this.openDetail(HeaderTabs.artists, (controller) =>
			this.pushArtist(controller, artist, this.setRootDetailController),
		);
	};

	private showPlaylist = (playlist: Playlist): void => {
		this.openDetail(HeaderTabs.playlists, (controller) => this.pushPlaylist(controller, playlist));
	};

	// Search results open in Library's own stack: unwind any current detail, select the matching
	// header tab so backing out lands on the right list, then push the detail.
	private openDetail(tab: HeaderTab, push: (controller: NavigationController) => void): void {
		const controller = this.rootController;
		if (!controller) {
			return;
		}
		this.unwindToTabRoot();
		if (tab !== this.state.activeTab) {
			this.setState({ activeTab: tab });
		}
		push(controller);
	}

	private unwindToTabRoot(): void {
		// popToSelf works on iOS; on Android it throws, so pop the first pushed detail (which removes
		// it and everything above it).
		if (Device.isAndroid()) {
			this.firstDetailController?.pop(false);
		} else {
			this.rootController?.popToSelf(false);
		}
		this.firstDetailController = undefined;
	}

	private pushAlbum(controller: NavigationController, album: Album): void {
		controller.push(
			AlbumView,
			{
				album,
				animationsEnabled: this.viewModel.animationsEnabled,
				downloadService: this.viewModel.downloadService,
				gridColumns: this.viewModel.gridColumns,
				imageCache: this.viewModel.imageCache,
				modalSlot: this.viewModel.modalSlot,
				navigationController: controller,
				onRootDetailControllerReady: this.setRootDetailController,
				paletteQueue: this.viewModel.paletteQueue,
				playbackStore: this.viewModel.playbackStore,
				toastService: this.viewModel.toastService,
				transport: this.viewModel.transport,
			},
			{},
			{ animated: this.viewModel.animationsEnabled },
		);
	}

	private pushArtist(
		controller: NavigationController,
		artist: Artist,
		onReady: (controller: NavigationController) => void,
	): void {
		controller.push(
			ArtistView,
			{
				animationsEnabled: this.viewModel.animationsEnabled,
				artist,
				downloadService: this.viewModel.downloadService,
				gridColumns: this.viewModel.gridColumns,
				imageCache: this.viewModel.imageCache,
				modalSlot: this.viewModel.modalSlot,
				navigationController: controller,
				onNavigationControllerReady: onReady,
				paletteQueue: this.viewModel.paletteQueue,
				playbackStore: this.viewModel.playbackStore,
				toastService: this.viewModel.toastService,
				transport: this.viewModel.transport,
			},
			{},
			{ animated: this.viewModel.animationsEnabled },
		);
	}

	private pushPlaylist(controller: NavigationController, playlist: Playlist): void {
		controller.push(
			PlaylistView,
			{
				animationsEnabled: this.viewModel.animationsEnabled,
				downloadService: this.viewModel.downloadService,
				gridColumns: this.viewModel.gridColumns,
				imageCache: this.viewModel.imageCache,
				modalSlot: this.viewModel.modalSlot,
				navigationController: controller,
				onNavigateToArtist: this.handlePlaylistArtistTap,
				onRootDetailControllerReady: this.setRootDetailController,
				paletteQueue: this.viewModel.paletteQueue,
				playbackStore: this.viewModel.playbackStore,
				playlist,
				playlistEditService: this.viewModel.playlistEditService,
				toastService: this.viewModel.toastService,
				transport: this.viewModel.transport,
			},
			{},
			{ animated: this.viewModel.animationsEnabled },
		);
	}

	private handlePlaylistArtistTap = (artistId: string): void => {
		const controller = this.rootController;
		if (!controller) {
			return;
		}
		this.viewModel.transport.getArtist(artistId).then((artist) => {
			if (!artist || this.isDestroyed()) {
				return;
			}
			this.pushArtist(controller, artist, () => {});
		});
	};
}

const styles = {
	root: new Style<View>({
		flexGrow: 1,
		width: '100%',
	}),
	tabHost: new Style<View>({
		flexGrow: 1,
		position: 'relative',
		width: '100%',
	}),
};
