import { $slot } from 'valdi_core/src/CompilerIntrinsics';
import { StatefulComponent } from 'valdi_core/src/Component';
import { Device } from 'valdi_core/src/Device';
import { Style } from 'valdi_core/src/Style';
import type { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';
import type { NavigationController } from 'valdi_navigation/src/NavigationController';
import { NavigationRoot } from 'valdi_navigation/src/NavigationRoot';
import type { View } from 'valdi_tsx/src/NativeTemplateElements';
import { type HeaderTab, HeaderTabs } from '../../models/App';
import type { DownloadService } from '../../services/DownloadService';
import type { ImageCache } from '../../services/ImageCache';
import type { PaletteGenerationQueue } from '../../services/PaletteGenerationQueue';
import type { PlaylistEditService } from '../../services/PlaylistEditService';
import type { ToastService } from '../../services/ToastService';
import type { PlaybackStore } from '../../stores/Playback';
import { type ConnectionMode, ConnectionModes } from '../../transports/Model';
import type { Transport } from '../../transports/Transport';
import { Floating } from '../components/Floating';
import { LibraryHeaderNav } from '../components/LibraryHeaderNav';
import { GenresView } from './GenresView';
import { PlaylistsView } from './PlaylistsView';
import { AlbumsView } from './V2AlbumsView';
import { ArtistsView } from './V2ArtistsView';

export interface LibraryViewModel {
	animationsEnabled: boolean;
	connectionMode: ConnectionMode;
	downloadService: DownloadService;
	gridColumns: number;
	imageCache: ImageCache;
	modalSlot: DetachedSlot;
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
						// Inline (not a helper) so the root child renders into the slot's context.
						this.rootController = navigationController;
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

		// Unwind any pushed detail to the tab root before swapping. popToSelf works on iOS; on
		// Android it throws, so pop the first pushed detail (removes it and everything above it).
		if (Device.isAndroid()) {
			this.firstDetailController?.pop(false);
		} else {
			this.rootController?.popToSelf(false);
		}
		this.firstDetailController = undefined;
		this.setState({ activeTab: tab });
	};

	private setRootDetailController = (controller: NavigationController): void => {
		this.firstDetailController = controller;
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
