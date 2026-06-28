import { $slot } from 'valdi_core/src/CompilerIntrinsics';
import { Component } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { NavigationController } from 'valdi_navigation/src/NavigationController';
import { NavigationRoot } from 'valdi_navigation/src/NavigationRoot';
import type { View } from 'valdi_tsx/src/NativeTemplateElements';
import { SearchView, type SearchViewModel } from '../views/SearchView';

export interface SearchTabViewModel {
	onNavigationControllerReady: (controller: NavigationController) => void;
	search: Omit<SearchViewModel, 'navigationController'>;
}

export class SearchTab extends Component<SearchTabViewModel> {
	onRender(): void {
		const search = this.viewModel.search;
		<view style={styles.host}>
			<NavigationRoot>
				{$slot((navigationController: NavigationController) => {
					this.viewModel.onNavigationControllerReady(navigationController);
					<SearchView
						animationsEnabled={search.animationsEnabled}
						downloadService={search.downloadService}
						focusSignal={search.focusSignal}
						gridColumns={search.gridColumns}
						imageCache={search.imageCache}
						modalSlot={search.modalSlot}
						navBarContext={search.navBarContext}
						navigationController={navigationController}
						onNavigateToLibraryResult={search.onNavigateToLibraryResult}
						paletteQueue={search.paletteQueue}
						playbackStore={search.playbackStore}
						playlistEditService={search.playlistEditService}
						searchStore={search.searchStore}
						toastService={search.toastService}
						transport={search.transport}
					/>;
				})}
			</NavigationRoot>
		</view>;
	}
}

const styles = {
	host: new Style<View>({
		flexGrow: 1,
		position: 'relative',
		width: '100%',
	}),
};
