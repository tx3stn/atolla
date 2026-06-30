import { $slot } from 'valdi_core/src/CompilerIntrinsics';
import { Component } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';
import type { NavigationController } from 'valdi_navigation/src/NavigationController';
import { NavigationRoot } from 'valdi_navigation/src/NavigationRoot';
import type { View } from 'valdi_tsx/src/NativeTemplateElements';
import type { Album } from '../../models/Album';
import type { Playlist } from '../../models/Playlist';
import type { Track } from '../../models/Track';
import type { DownloadService } from '../../services/DownloadService';
import type { ImageCache } from '../../services/ImageCache';
import type { OnThisDayService } from '../../services/OnThisDayService';
import type { PaletteGenerationQueue } from '../../services/PaletteGenerationQueue';
import type { PlaylistEditService } from '../../services/PlaylistEditService';
import type { RecentlyAddedService } from '../../services/RecentlyAddedService';
import type { ToastService } from '../../services/ToastService';
import type { PlaybackStore } from '../../stores/Playback';
import type { ConnectionMode } from '../../transports/Model';
import type { Transport } from '../../transports/Transport';
import { AlbumView } from '../views/AlbumView';
import { ArtistView } from '../views/ArtistView';
import { HomeView } from '../views/HomeView';
import { PlaylistView } from '../views/PlaylistView';

export interface HomeTabViewModel {
	animationsEnabled: boolean;
	connectionMode: ConnectionMode;
	downloadService: DownloadService;
	gridColumns: number;
	imageCache: ImageCache;
	modalSlot: DetachedSlot;
	onNavigationControllerReady: (controller: NavigationController) => void;
	onRequestModeChange: (mode: ConnectionMode) => Promise<boolean>;
	onThisDayService?: OnThisDayService;
	paletteQueue?: PaletteGenerationQueue;
	playbackStore: PlaybackStore;
	playlistEditService: PlaylistEditService;
	recentlyAddedService?: RecentlyAddedService;
	recentlyPlayedTracks: Array<Track>;
	toastService: ToastService;
	transport: Transport;
}

export class HomeTab extends Component<HomeTabViewModel> {
	private navigationController?: NavigationController;

	onRender(): void {
		<view style={styles.host}>
			<NavigationRoot>
				{$slot((navigationController: NavigationController) => {
					this.navigationController = navigationController;
					this.viewModel.onNavigationControllerReady(navigationController);

					<HomeView
						animationsEnabled={this.viewModel.animationsEnabled}
						connectionMode={this.viewModel.connectionMode}
						gridColumns={this.viewModel.gridColumns}
						imageCache={this.viewModel.imageCache}
						modalSlot={this.viewModel.modalSlot}
						onNavigateToArtist={this.handleArtistTap}
						onOpenAlbum={this.handleAlbumTap}
						onOpenPlaylist={this.handleOpenPlaylist}
						onRequestModeChange={this.viewModel.onRequestModeChange}
						onThisDayService={this.viewModel.onThisDayService}
						playbackStore={this.viewModel.playbackStore}
						recentlyAddedService={this.viewModel.recentlyAddedService}
						recentlyPlayedTracks={this.viewModel.recentlyPlayedTracks}
						toastService={this.viewModel.toastService}
						transport={this.viewModel.transport}
					/>;
				})}
			</NavigationRoot>
		</view>;
	}

	private handleAlbumTap = (album: Album): void => {
		const controller = this.navigationController;
		if (!controller) {
			return;
		}

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
				onRootDetailControllerReady: () => {},
				paletteQueue: this.viewModel.paletteQueue,
				playbackStore: this.viewModel.playbackStore,
				toastService: this.viewModel.toastService,
				transport: this.viewModel.transport,
			},
			{},
			{ animated: this.viewModel.animationsEnabled },
		);
	};

	private handleOpenPlaylist = (playlist: Playlist): void => {
		const controller = this.navigationController;
		if (!controller) {
			return;
		}

		controller.push(
			PlaylistView,
			{
				animationsEnabled: this.viewModel.animationsEnabled,
				downloadService: this.viewModel.downloadService,
				gridColumns: this.viewModel.gridColumns,
				imageCache: this.viewModel.imageCache,
				modalSlot: this.viewModel.modalSlot,
				navigationController: controller,
				onNavigateToArtist: this.handleArtistTap,
				onRootDetailControllerReady: () => {},
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
	};

	private handleArtistTap = (artistId: string): void => {
		const controller = this.navigationController;
		if (!controller) {
			return;
		}

		this.viewModel.transport
			.getArtist(artistId)
			.then((artist) => {
				if (!artist) {
					return;
				}

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
						onNavigationControllerReady: () => {},
						paletteQueue: this.viewModel.paletteQueue,
						playbackStore: this.viewModel.playbackStore,
						toastService: this.viewModel.toastService,
						transport: this.viewModel.transport,
					},
					{},
					{ animated: this.viewModel.animationsEnabled },
				);
			})
			.catch(() => {});
	};
}

const styles = {
	host: new Style<View>({
		flexGrow: 1,
		position: 'relative',
		width: '100%',
	}),
};
