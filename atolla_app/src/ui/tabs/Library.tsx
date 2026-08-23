import type { Transport } from 'atolla_core/src/transports/Transport';
import type { DownloadService } from 'atolla_player/src/services/DownloadService';
import type { PlaylistEditService } from 'atolla_player/src/services/PlaylistEditService';
import type { PlaybackStore } from 'atolla_player/src/stores/Playback';
import { $slot } from 'valdi_core/src/CompilerIntrinsics';
import { StatefulComponent } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';
import type { NavigationController } from 'valdi_navigation/src/NavigationController';
import { NavigationRoot } from 'valdi_navigation/src/NavigationRoot';
import type { View } from 'valdi_tsx/src/NativeTemplateElements';
import {
	type ConnectionMode,
	ConnectionModes,
	FooterTabs,
	type HeaderTab,
	HeaderTabs,
} from '../../models/App';
import type { LyricsService } from '../../services/LyricsService';
import type { NetworkStatus } from '../../services/NetworkStatus';
import type { PaletteGenerationQueue } from '../../services/PaletteGenerationQueue';
import type { ToastService } from '../../services/ToastService';
import type { ViewCache } from '../../services/ViewCache';
import { appShellStore } from '../../stores/AppShell';
import { headerStore } from '../../stores/Header';
import type { PinnedItemsStore } from '../../stores/PinnedItems';
import type { Preferences } from '../../stores/Preferences';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { type DetailPushDeps, pushArtist } from '../flows/PushDetail';
import { AlbumsView } from '../views/AlbumsView';
import { ArtistsView } from '../views/ArtistsView';
import { GenresView } from '../views/GenresView';
import { PlaylistsView } from '../views/PlaylistsView';

export interface LibraryViewModel {
	connectionMode: ConnectionMode;
	downloadService: DownloadService;
	lyricsService: LyricsService;
	modalSlot: DetachedSlot;
	networkStatus: NetworkStatus;
	offlineDataInvalidations: number;
	onNavigationControllerReady: (controller: NavigationController) => void;
	paletteQueue: PaletteGenerationQueue;
	pinnedItemsStore?: PinnedItemsStore;
	playbackStore: PlaybackStore;
	playlistEditService: PlaylistEditService;
	preferences: Preferences;
	toastService: ToastService;
	transport: Transport;
	viewCache: ViewCache;
}

interface LibraryViewState {
	activeTab: HeaderTab;
	letterFilter: string | null;
}

export class LibraryView extends StatefulComponent<LibraryViewModel, LibraryViewState> {
	private rootController?: NavigationController;

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
				<ErrorBoundary resetKey={tab}>
					<NavigationRoot>
						{$slot((navigationController: NavigationController) => {
							this.rootController = navigationController;
							this.viewModel.onNavigationControllerReady(navigationController);

							if (tab === HeaderTabs.artists) {
								<ArtistsView
									downloadService={this.viewModel.downloadService}
									isOfflineMode={isOfflineMode}
									letterFilter={this.state.letterFilter}
									lyricsService={this.viewModel.lyricsService}
									modalSlot={this.viewModel.modalSlot}
									navigationController={navigationController}
									networkStatus={this.viewModel.networkStatus}
									offlineDataInvalidations={this.viewModel.offlineDataInvalidations}
									paletteQueue={this.viewModel.paletteQueue}
									pinnedItemsStore={this.viewModel.pinnedItemsStore}
									playbackStore={this.viewModel.playbackStore}
									preferences={this.viewModel.preferences}
									toastService={this.viewModel.toastService}
									transport={this.viewModel.transport}
									viewCache={this.viewModel.viewCache}
								/>;
							} else if (tab === HeaderTabs.albums) {
								<AlbumsView
									downloadService={this.viewModel.downloadService}
									isOfflineMode={isOfflineMode}
									letterFilter={this.state.letterFilter}
									lyricsService={this.viewModel.lyricsService}
									modalSlot={this.viewModel.modalSlot}
									navigationController={navigationController}
									networkStatus={this.viewModel.networkStatus}
									offlineDataInvalidations={this.viewModel.offlineDataInvalidations}
									paletteQueue={this.viewModel.paletteQueue}
									pinnedItemsStore={this.viewModel.pinnedItemsStore}
									playbackStore={this.viewModel.playbackStore}
									preferences={this.viewModel.preferences}
									toastService={this.viewModel.toastService}
									transport={this.viewModel.transport}
									viewCache={this.viewModel.viewCache}
								/>;
							} else if (tab === HeaderTabs.playlists) {
								<PlaylistsView
									downloadService={this.viewModel.downloadService}
									isOfflineMode={isOfflineMode}
									letterFilter={this.state.letterFilter}
									lyricsService={this.viewModel.lyricsService}
									modalSlot={this.viewModel.modalSlot}
									navigationController={navigationController}
									networkStatus={this.viewModel.networkStatus}
									offlineDataInvalidations={this.viewModel.offlineDataInvalidations}
									onNavigateToArtist={this.handlePlaylistArtistTap}
									paletteQueue={this.viewModel.paletteQueue}
									pinnedItemsStore={this.viewModel.pinnedItemsStore}
									playbackStore={this.viewModel.playbackStore}
									playlistEditService={this.viewModel.playlistEditService}
									preferences={this.viewModel.preferences}
									toastService={this.viewModel.toastService}
									transport={this.viewModel.transport}
									viewCache={this.viewModel.viewCache}
								/>;
							} else {
								<GenresView
									downloadService={this.viewModel.downloadService}
									isOfflineMode={isOfflineMode}
									letterFilter={this.state.letterFilter}
									lyricsService={this.viewModel.lyricsService}
									modalSlot={this.viewModel.modalSlot}
									navigationController={navigationController}
									networkStatus={this.viewModel.networkStatus}
									offlineDataInvalidations={this.viewModel.offlineDataInvalidations}
									onNavigateToArtist={this.handlePlaylistArtistTap}
									pinnedItemsStore={this.viewModel.pinnedItemsStore}
									playbackStore={this.viewModel.playbackStore}
									preferences={this.viewModel.preferences}
									toastService={this.viewModel.toastService}
									transport={this.viewModel.transport}
									viewCache={this.viewModel.viewCache}
								/>;
							}
						})}
					</NavigationRoot>
				</ErrorBoundary>
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

		appShellStore.unwindToRoot(FooterTabs.library);
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

	private detailDeps(): DetailPushDeps {
		return {
			downloadService: this.viewModel.downloadService,
			lyricsService: this.viewModel.lyricsService,
			modalSlot: this.viewModel.modalSlot,
			networkStatus: this.viewModel.networkStatus,
			onNavigateToArtist: this.handlePlaylistArtistTap,
			paletteQueue: this.viewModel.paletteQueue,
			pinnedItemsStore: this.viewModel.pinnedItemsStore,
			playbackStore: this.viewModel.playbackStore,
			playlistEditService: this.viewModel.playlistEditService,
			preferences: this.viewModel.preferences,
			toastService: this.viewModel.toastService,
			transport: this.viewModel.transport,
			viewCache: this.viewModel.viewCache,
		};
	}

	private handlePlaylistArtistTap = (artistId: string): void => {
		const controller = this.rootController;
		if (!controller || !artistId || this.isDestroyed()) {
			return;
		}
		// best-effort: navigate on the id; ArtistView self-heals the name/image
		pushArtist(controller, this.detailDeps(), { id: artistId, name: '' });
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
