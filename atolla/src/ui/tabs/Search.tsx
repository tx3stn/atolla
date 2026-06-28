import { $slot } from 'valdi_core/src/CompilerIntrinsics';
import { Component } from 'valdi_core/src/Component';
import type { NavigationController } from 'valdi_navigation/src/NavigationController';
import { NavigationRoot } from 'valdi_navigation/src/NavigationRoot';
import { SearchView, type SearchViewModel } from '../views/SearchView';

export interface SearchTabViewModel {
	search: Omit<SearchViewModel, 'navigationController'>;
}

export class SearchTab extends Component<SearchTabViewModel> {
	onRender(): void {
		const search = this.viewModel.search;
		<NavigationRoot>
			{$slot((navigationController: NavigationController) => {
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
		</NavigationRoot>;
	}
}
