import { $slot } from 'valdi_core/src/CompilerIntrinsics';
import { Component } from 'valdi_core/src/Component';
import type { NavigationController } from 'valdi_navigation/src/NavigationController';
import { NavigationRoot } from 'valdi_navigation/src/NavigationRoot';
import { HomeView, type HomeViewModel } from '../views/HomeView';

export interface HomeTabViewModel {
	home: HomeViewModel;
	onNavigationControllerReady: (controller: NavigationController) => void;
}

export class HomeTab extends Component<HomeTabViewModel> {
	onRender(): void {
		const home = this.viewModel.home;
		<NavigationRoot>
			{$slot((navigationController: NavigationController) => {
				this.viewModel.onNavigationControllerReady(navigationController);
				<HomeView
					animationsEnabled={home.animationsEnabled}
					connectionMode={home.connectionMode}
					gridColumns={home.gridColumns}
					imageCache={home.imageCache}
					modalSlot={home.modalSlot}
					onNavigateToArtist={home.onNavigateToArtist}
					onOpenAlbum={home.onOpenAlbum}
					onOpenPlaylist={home.onOpenPlaylist}
					onRequestModeChange={home.onRequestModeChange}
					onThisDayService={home.onThisDayService}
					playbackStore={home.playbackStore}
					recentlyAddedService={home.recentlyAddedService}
					recentlyPlayedTracks={home.recentlyPlayedTracks}
					toastService={home.toastService}
					transport={home.transport}
				/>;
			})}
		</NavigationRoot>;
	}
}
