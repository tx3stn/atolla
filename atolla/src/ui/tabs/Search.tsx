import { $slot } from 'valdi_core/src/CompilerIntrinsics';
import { Component } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { NavigationController } from 'valdi_navigation/src/NavigationController';
import { NavigationRoot } from 'valdi_navigation/src/NavigationRoot';
import type { View } from 'valdi_tsx/src/NativeTemplateElements';
import { type DetailPushDeps, pushAlbum, pushArtist, pushPlaylist } from '../flows/PushDetail';
import {
	type SearchLibraryNavigationTarget,
	SearchView,
	type SearchViewModel,
} from '../views/SearchView';

export interface SearchTabViewModel {
	onNavigationControllerReady: (controller: NavigationController) => void;
	search: Omit<SearchViewModel, 'navigationController'>;
}

export class SearchTab extends Component<SearchTabViewModel> {
	private rootController?: NavigationController;

	onRender(): void {
		const search = this.viewModel.search;
		<view style={styles.host}>
			<NavigationRoot>
				{$slot((navigationController: NavigationController) => {
					this.rootController = navigationController;
					this.viewModel.onNavigationControllerReady(navigationController);
					<SearchView
						downloadService={search.downloadService}
						focusSignal={search.focusSignal}
						imageCache={search.imageCache}
						modalSlot={search.modalSlot}
						navigationController={navigationController}
						onNavigateToLibraryResult={this.handleNavigateToLibraryResult}
						paletteQueue={search.paletteQueue}
						playbackStore={search.playbackStore}
						playlistEditService={search.playlistEditService}
						preferences={search.preferences}
						searchStore={search.searchStore}
						toastService={search.toastService}
						transport={search.transport}
						viewCache={search.viewCache}
					/>;
				})}
			</NavigationRoot>
		</view>;
	}

	private detailDeps(): DetailPushDeps {
		const search = this.viewModel.search;
		return {
			downloadService: search.downloadService,
			imageCache: search.imageCache,
			modalSlot: search.modalSlot,
			onNavigateToArtist: this.handleArtistById,
			paletteQueue: search.paletteQueue,
			playbackStore: search.playbackStore,
			playlistEditService: search.playlistEditService,
			preferences: search.preferences,
			toastService: search.toastService,
			transport: search.transport,
			viewCache: search.viewCache,
		};
	}

	private handleArtistById = (artistId: string): void => {
		const controller = this.rootController;
		if (!controller || !artistId) {
			return;
		}
		// best-effort: navigate on the id; ArtistView self-heals the name/image
		pushArtist(controller, this.detailDeps(), { id: artistId, name: '' });
	};

	private handleNavigateToLibraryResult = (target: SearchLibraryNavigationTarget): void => {
		const controller = this.rootController;
		if (!controller) {
			return;
		}
		if (target.kind === 'album') {
			pushAlbum(controller, this.detailDeps(), target.album);
		} else if (target.kind === 'artist') {
			pushArtist(controller, this.detailDeps(), target.artist);
		} else {
			pushPlaylist(controller, this.detailDeps(), target.playlist);
		}
	};
}

const styles = {
	host: new Style<View>({
		flexGrow: 1,
		position: 'relative',
		width: '100%',
	}),
};
