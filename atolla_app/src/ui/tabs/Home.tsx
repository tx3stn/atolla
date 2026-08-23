import type { Album } from 'atolla_core/src/models/Album';
import type { Genre } from 'atolla_core/src/models/Genre';
import type { Playlist } from 'atolla_core/src/models/Playlist';
import type { Track } from 'atolla_core/src/models/Track';
import type { Transport } from 'atolla_core/src/transports/Transport';
import type { DownloadService } from 'atolla_player/src/services/DownloadService';
import type { PlaybackStore } from 'atolla_player/src/stores/Playback';
import { $slot } from 'valdi_core/src/CompilerIntrinsics';
import { Component } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';
import type { NavigationController } from 'valdi_navigation/src/NavigationController';
import { NavigationRoot } from 'valdi_navigation/src/NavigationRoot';
import type { View } from 'valdi_tsx/src/NativeTemplateElements';
import type { ConnectionMode } from '../../models/App';
import type { LyricsService } from '../../services/LyricsService';
import type { NetworkStatus } from '../../services/NetworkStatus';
import type { OnThisDayService } from '../../services/OnThisDayService';
import type { PaletteGenerationQueue } from '../../services/PaletteGenerationQueue';
import type { RecentlyAddedService } from '../../services/RecentlyAddedService';
import type { ToastService } from '../../services/ToastService';
import type { ViewCache } from '../../services/ViewCache';
import type { PinnedItemsStore } from '../../stores/PinnedItems';
import type { Preferences } from '../../stores/Preferences';
import {
	type DetailPushDeps,
	pushAlbum,
	pushArtist,
	pushGenre,
	pushPlaylist,
} from '../flows/PushDetail';
import { HomeView } from '../views/HomeView';

export interface HomeTabViewModel {
	connectionMode: ConnectionMode;
	downloadService: DownloadService;
	lyricsService: LyricsService;
	modalSlot: DetachedSlot;
	networkStatus: NetworkStatus;
	onNavigationControllerReady: (controller: NavigationController) => void;
	onThisDayService?: OnThisDayService;
	paletteQueue: PaletteGenerationQueue;
	pinnedItemsStore?: PinnedItemsStore;
	playbackStore: PlaybackStore;
	preferences: Preferences;
	recentlyAddedService?: RecentlyAddedService;
	recentlyPlayedTracks: Array<Track>;
	toastService: ToastService;
	transport: Transport;
	viewCache: ViewCache;
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
						connectionMode={this.viewModel.connectionMode}
						lyricsService={this.viewModel.lyricsService}
						modalSlot={this.viewModel.modalSlot}
						onNavigateToArtist={this.handleArtistTap}
						onOpenAlbum={this.handleAlbumTap}
						onOpenGenre={this.handleGenreTap}
						onOpenPlaylist={this.handleOpenPlaylist}
						onThisDayService={this.viewModel.onThisDayService}
						pinnedItemsStore={this.viewModel.pinnedItemsStore}
						playbackStore={this.viewModel.playbackStore}
						preferences={this.viewModel.preferences}
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
			downloadService: this.viewModel.downloadService,
			lyricsService: this.viewModel.lyricsService,
			modalSlot: this.viewModel.modalSlot,
			networkStatus: this.viewModel.networkStatus,
			onNavigateToArtist: this.handleArtistTap,
			paletteQueue: this.viewModel.paletteQueue,
			pinnedItemsStore: this.viewModel.pinnedItemsStore,
			playbackStore: this.viewModel.playbackStore,
			preferences: this.viewModel.preferences,
			toastService: this.viewModel.toastService,
			transport: this.viewModel.transport,
			viewCache: this.viewModel.viewCache,
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
		if (!controller || !artistId) {
			return;
		}
		// best-effort: navigate on the id; ArtistView self-heals the name/image
		pushArtist(controller, this.detailDeps(), { id: artistId, name: '' });
	};

	private handleGenreTap = (genre: Genre): void => {
		if (!this.rootController) {
			return;
		}
		pushGenre(this.rootController, this.detailDeps(), genre);
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
