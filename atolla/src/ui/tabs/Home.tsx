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
import type { RecentlyAddedService } from '../../services/RecentlyAddedService';
import type { ToastService } from '../../services/ToastService';
import type { PlaybackStore } from '../../stores/Playback';
import type { ConnectionMode } from '../../transports/Model';
import type { Transport } from '../../transports/Transport';
import { type DetailPushDeps, pushAlbum, pushArtist, pushPlaylist } from '../flows/PushDetail';
import { HomeView } from '../views/HomeView';

export interface HomeTabViewModel {
	animationsEnabled: boolean;
	connectionMode: ConnectionMode;
	downloadService: DownloadService;
	gridColumns: number;
	imageCache: ImageCache;
	modalSlot: DetachedSlot;
	onNavigationControllerReady: (controller: NavigationController) => void;
	onThisDayService?: OnThisDayService;
	paletteQueue: PaletteGenerationQueue;
	playbackStore: PlaybackStore;
	recentlyAddedService?: RecentlyAddedService;
	recentlyPlayedTracks: Array<Track>;
	toastService: ToastService;
	transport: Transport;
}

export class HomeTab extends Component<HomeTabViewModel> {
	private rootController?: NavigationController;

	onRender(): void {
		<view style={styles.host}>
			<NavigationRoot>
				{$slot((navigationController: NavigationController) => {
					this.rootController = navigationController;
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

	private detailDeps(): DetailPushDeps {
		return {
			animationsEnabled: this.viewModel.animationsEnabled,
			downloadService: this.viewModel.downloadService,
			gridColumns: this.viewModel.gridColumns,
			imageCache: this.viewModel.imageCache,
			modalSlot: this.viewModel.modalSlot,
			onNavigateToArtist: this.handleArtistTap,
			paletteQueue: this.viewModel.paletteQueue,
			playbackStore: this.viewModel.playbackStore,
			toastService: this.viewModel.toastService,
			transport: this.viewModel.transport,
		};
	}

	private handleAlbumTap = (album: Album): void => {
		if (!this.rootController) {
			return;
		}
		pushAlbum(this.rootController, this.detailDeps(), album);
	};

	private handleArtistTap = (artistId: string): void => {
		const controller = this.rootController;
		if (!controller) {
			return;
		}
		this.viewModel.transport
			.getArtist(artistId)
			.then((artist) => {
				if (!artist) {
					return;
				}
				pushArtist(controller, this.detailDeps(), artist);
			})
			.catch(() => {});
	};

	private handleOpenPlaylist = (playlist: Playlist): void => {
		if (!this.rootController) {
			return;
		}
		pushPlaylist(this.rootController, this.detailDeps(), playlist);
	};
}

const styles = {
	host: new Style<View>({
		flexGrow: 1,
		position: 'relative',
		width: '100%',
	}),
};
