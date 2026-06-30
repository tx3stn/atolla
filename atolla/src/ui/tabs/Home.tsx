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
import type { ImageCache } from '../../services/ImageCache';
import type { NavCoordinator } from '../../services/NavCoordinator';
import type { OnThisDayService } from '../../services/OnThisDayService';
import type { RecentlyAddedService } from '../../services/RecentlyAddedService';
import type { ToastService } from '../../services/ToastService';
import type { PlaybackStore } from '../../stores/Playback';
import type { ConnectionMode } from '../../transports/Model';
import type { Transport } from '../../transports/Transport';
import { HomeView } from '../views/HomeView';

export interface HomeTabViewModel {
	animationsEnabled: boolean;
	connectionMode: ConnectionMode;
	gridColumns: number;
	imageCache: ImageCache;
	modalSlot: DetachedSlot;
	navCoordinator: NavCoordinator;
	onNavigationControllerReady: (controller: NavigationController) => void;
	onRequestModeChange: (mode: ConnectionMode) => Promise<boolean>;
	onThisDayService?: OnThisDayService;
	playbackStore: PlaybackStore;
	recentlyAddedService?: RecentlyAddedService;
	recentlyPlayedTracks: Array<Track>;
	toastService: ToastService;
	transport: Transport;
}

export class HomeTab extends Component<HomeTabViewModel> {
	onRender(): void {
		<view style={styles.host}>
			<NavigationRoot>
				{$slot((navigationController: NavigationController) => {
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
		this.viewModel.navCoordinator.openAlbum(album);
	};

	private handleOpenPlaylist = (playlist: Playlist): void => {
		this.viewModel.navCoordinator.openPlaylist(playlist);
	};

	private handleArtistTap = (artistId: string): void => {
		this.viewModel.transport
			.getArtist(artistId)
			.then((artist) => {
				if (!artist) {
					return;
				}
				this.viewModel.navCoordinator.openArtist(artist);
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
