import { $slot } from 'valdi_core/src/CompilerIntrinsics';
import { StatefulComponent } from 'valdi_core/src/Component';
import { Device } from 'valdi_core/src/Device';
import { Style } from 'valdi_core/src/Style';
import type { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';
import type { NavigationController } from 'valdi_navigation/src/NavigationController';
import { NavigationRoot } from 'valdi_navigation/src/NavigationRoot';
import type { View } from 'valdi_tsx/src/NativeTemplateElements';
import { FooterTabs, type HeaderTab, HeaderTabs } from '../../models/App';
import type { DownloadService } from '../../services/DownloadService';
import type { ImageCache } from '../../services/ImageCache';
import type { PaletteGenerationQueue } from '../../services/PaletteGenerationQueue';
import type { PlaylistEditService } from '../../services/PlaylistEditService';
import type { ToastService } from '../../services/ToastService';
import { headerStore } from '../../stores/Header';
import type { PlaybackStore } from '../../stores/Playback';
import type { Preferences } from '../../stores/Preferences';
import { type ConnectionMode, ConnectionModes } from '../../transports/Model';
import type { Transport } from '../../transports/Transport';
import { type DetailPushDeps, pushArtist } from '../flows/PushDetail';
import { AlbumsView } from '../views/AlbumsView';
import { ArtistsView } from '../views/ArtistsView';
import { GenresView } from '../views/GenresView';
import { PlaylistsView } from '../views/PlaylistsView';

export interface LibraryViewModel {
	connectionMode: ConnectionMode;
	downloadService: DownloadService;
	imageCache: ImageCache;
	modalSlot: DetachedSlot;
	onNavigationControllerReady: (controller: NavigationController) => void;
	paletteQueue: PaletteGenerationQueue;
	playbackStore: PlaybackStore;
	playlistEditService: PlaylistEditService;
	preferences: Preferences;
	toastService: ToastService;
	transport: Transport;
}

interface LibraryViewState {
	activeTab: HeaderTab;
	letterFilter: string | null;
}

export class LibraryView extends StatefulComponent<LibraryViewModel, LibraryViewState> {
	private rootController?: NavigationController;
	private firstDetailController?: NavigationController;

	state: LibraryViewState = {
		activeTab: HeaderTabs.artists,
		letterFilter: null,
	};

	onCreate(): void {
		this.publishHeader(this.state.activeTab, this.state.letterFilter);
	}

	onRender(): void {
		const tab = this.state.activeTab;
		const isOfflineMode = this.viewModel.connectionMode === ConnectionModes.offline;
		<view style={styles.root}>
			<view style={styles.tabHost}>
				<NavigationRoot>
					{$slot((navigationController: NavigationController) => {
						this.rootController = navigationController;
						this.viewModel.onNavigationControllerReady(navigationController);

						if (tab === HeaderTabs.artists) {
							<ArtistsView
								downloadService={this.viewModel.downloadService}
								imageCache={this.viewModel.imageCache}
								isOfflineMode={isOfflineMode}
								letterFilter={this.state.letterFilter}
								modalSlot={this.viewModel.modalSlot}
								navigationController={navigationController}
								onRootDetailControllerReady={this.setRootDetailController}
								paletteQueue={this.viewModel.paletteQueue}
								playbackStore={this.viewModel.playbackStore}
								preferences={this.viewModel.preferences}
								toastService={this.viewModel.toastService}
								transport={this.viewModel.transport}
							/>;
						} else if (tab === HeaderTabs.albums) {
							<AlbumsView
								downloadService={this.viewModel.downloadService}
								imageCache={this.viewModel.imageCache}
								isOfflineMode={isOfflineMode}
								letterFilter={this.state.letterFilter}
								modalSlot={this.viewModel.modalSlot}
								navigationController={navigationController}
								onRootDetailControllerReady={this.setRootDetailController}
								paletteQueue={this.viewModel.paletteQueue}
								playbackStore={this.viewModel.playbackStore}
								preferences={this.viewModel.preferences}
								toastService={this.viewModel.toastService}
								transport={this.viewModel.transport}
							/>;
						} else if (tab === HeaderTabs.playlists) {
							<PlaylistsView
								downloadService={this.viewModel.downloadService}
								imageCache={this.viewModel.imageCache}
								isOfflineMode={isOfflineMode}
								letterFilter={this.state.letterFilter}
								modalSlot={this.viewModel.modalSlot}
								navigationController={navigationController}
								onNavigateToArtist={this.handlePlaylistArtistTap}
								onRootDetailControllerReady={this.setRootDetailController}
								paletteQueue={this.viewModel.paletteQueue}
								playbackStore={this.viewModel.playbackStore}
								playlistEditService={this.viewModel.playlistEditService}
								preferences={this.viewModel.preferences}
								toastService={this.viewModel.toastService}
								transport={this.viewModel.transport}
							/>;
						} else {
							<GenresView
								downloadService={this.viewModel.downloadService}
								imageCache={this.viewModel.imageCache}
								isOfflineMode={isOfflineMode}
								letterFilter={this.state.letterFilter}
								modalSlot={this.viewModel.modalSlot}
								navigationController={navigationController}
								onNavigateToArtist={this.handlePlaylistArtistTap}
								onRootDetailControllerReady={this.setRootDetailController}
								playbackStore={this.viewModel.playbackStore}
								preferences={this.viewModel.preferences}
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
		this.publishHeader(this.state.activeTab, letter);
	};

	private handleTabNavigation = (tab: HeaderTab): void => {
		if (tab === this.state.activeTab) {
			return;
		}

		this.unwindToTabRoot();
		this.setState({ activeTab: tab, letterFilter: null });
		this.publishHeader(tab, null);
	};

	private publishHeader(activeTab: HeaderTab, letterFilter: string | null): void {
		headerStore.setDescriptor(FooterTabs.library, {
			activeTab,
			kind: 'library',
			letterFilter,
			onAlphabetLetterTap: this.handleFilterByLetter,
			onTabTap: this.handleTabNavigation,
		});
	}

	private setRootDetailController = (controller: NavigationController): void => {
		this.firstDetailController = controller;
	};

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

	// `recordAsFirstDetail` lets a top-level list→detail push register its controller so section
	// switches unwind to root; nested pushes (artist from a playlist) pass false so they don't
	// replace the tab's first detail.
	private detailDeps(recordAsFirstDetail = true): DetailPushDeps {
		return {
			downloadService: this.viewModel.downloadService,
			imageCache: this.viewModel.imageCache,
			modalSlot: this.viewModel.modalSlot,
			onNavigateToArtist: this.handlePlaylistArtistTap,
			onRootDetailControllerReady: recordAsFirstDetail ? this.setRootDetailController : undefined,
			paletteQueue: this.viewModel.paletteQueue,
			playbackStore: this.viewModel.playbackStore,
			playlistEditService: this.viewModel.playlistEditService,
			preferences: this.viewModel.preferences,
			toastService: this.viewModel.toastService,
			transport: this.viewModel.transport,
		};
	}

	private handlePlaylistArtistTap = (artistId: string): void => {
		const controller = this.rootController;
		if (!controller || !artistId || this.isDestroyed()) {
			return;
		}
		// best-effort: navigate on the id; ArtistView self-heals the name/image
		pushArtist(controller, this.detailDeps(false), { id: artistId, name: '' });
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
