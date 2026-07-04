import { StatefulComponent } from 'valdi_core/src/Component';
import { Device } from 'valdi_core/src/Device';
import { Style } from 'valdi_core/src/Style';
import type { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';
import type { NavigationController } from 'valdi_navigation/src/NavigationController';
import type { View } from 'valdi_tsx/src/NativeTemplateElements';
import { type FooterTab, FooterTabs } from './models/App';
import Strings from './Strings';
import type { ArtworkPaletteService } from './services/ArtworkPaletteService';
import { backNavRouter } from './services/BackNavRouter';
import type { DownloadService } from './services/DownloadService';
import type { PlaybackOrchestrator } from './services/PlaybackOrchestrator';
import type { SessionController } from './services/SessionController';
import type { ToastService } from './services/ToastService';
import { appShellStore } from './stores/AppShell';
import { headerStore } from './stores/Header';
import type { PlaybackStore } from './stores/Playback';
import type { Preferences } from './stores/Preferences';
import { theme } from './theme';
import { type ConnectionMode, ConnectionModes } from './transports/Model';
import { ErrorBoundary } from './ui/components/ErrorBoundary';
import { GaplessPlayer } from './ui/components/GaplessPlayer';
import { MockPlayer } from './ui/components/MockPlayer';
import { OverlayHost } from './ui/components/OverlayHost';
import { HomeTab, type HomeTabViewModel } from './ui/tabs/Home';
import { LibraryView, type LibraryViewModel } from './ui/tabs/Library';
import { SearchTab } from './ui/tabs/Search';
import { SettingsTab } from './ui/tabs/Settings';
import type { SearchViewModel } from './ui/views/SearchView';

export interface AuthedAppViewModel {
	connectionMode: ConnectionMode;
	downloadService: DownloadService;
	homeViewModel: Omit<HomeTabViewModel, 'onNavigationControllerReady'>;
	libraryViewModel: Omit<LibraryViewModel, 'onNavigationControllerReady'>;
	modalSlot: DetachedSlot;
	paletteService: ArtworkPaletteService;
	playbackOrchestrator: PlaybackOrchestrator;
	playbackStore: PlaybackStore;
	preferences: Preferences;
	searchViewModel: Omit<SearchViewModel, 'navigationController'>;
	sessionController: SessionController;
	toastService: ToastService;
}

export interface AuthedAppState {
	revision: number;
}

export class AuthedApp extends StatefulComponent<AuthedAppViewModel, AuthedAppState> {
	state: AuthedAppState = { revision: 0 };

	private androidBackObserverInstalled = false;

	onCreate(): void {
		this.registerDisposable(
			appShellStore.subscribe(() => this.setState({ revision: this.state.revision + 1 })),
		);
		backNavRouter.setActiveTab(appShellStore.activeFooterTab);
		headerStore.setDescriptor(FooterTabs.home, { kind: 'title', title: Strings.homeTitle() });
		headerStore.setDescriptor(FooterTabs.settings, {
			kind: 'title',
			title: Strings.settingsTitle(),
		});
		headerStore.setDescriptor(FooterTabs.search, {
			kind: 'title',
			title: Strings.searchTitle(),
		});
	}

	onDestroy(): void {
		if (this.androidBackObserverInstalled) {
			Device.setBackButtonObserver(undefined);
		}
	}

	onRender(): void {
		const home = this.viewModel.homeViewModel;
		const library = this.viewModel.libraryViewModel;

		<view style={theme.app.root}>
			<view style={theme.app.content}>
				{this.viewModel.connectionMode === ConnectionModes.mock ? (
					<MockPlayer playbackStore={this.viewModel.playbackStore} />
				) : (
					<GaplessPlayer
						activeSourceUrl={this.viewModel.playbackOrchestrator.getTrackPlaybackSourceUrl()}
						nextSourceUrl={this.viewModel.playbackOrchestrator.getNextTrackSourceUrl()}
						onPlaybackError={(error) =>
							this.viewModel.playbackOrchestrator.handlePlaybackError(error)
						}
						onPlaybackEvent={(event) =>
							this.viewModel.playbackOrchestrator.handlePlaybackEvent(event)
						}
						onTrackCompleted={() => this.viewModel.playbackOrchestrator.handleTrackCompleted()}
						playbackStore={this.viewModel.playbackStore}
					/>
				)}

				<view style={this.tabStyle(FooterTabs.home)}>
					<ErrorBoundary resetKey='home'>
						<HomeTab
							animationsEnabled={home.animationsEnabled}
							connectionMode={home.connectionMode}
							downloadService={home.downloadService}
							gridColumns={home.gridColumns}
							imageCache={home.imageCache}
							modalSlot={home.modalSlot}
							onNavigationControllerReady={this.captureHomeController}
							onThisDayService={home.onThisDayService}
							paletteQueue={home.paletteQueue}
							playbackStore={home.playbackStore}
							recentlyAddedService={home.recentlyAddedService}
							recentlyPlayedTracks={home.recentlyPlayedTracks}
							toastService={home.toastService}
							transport={home.transport}
						/>
					</ErrorBoundary>
				</view>

				<view style={this.tabStyle(FooterTabs.library)}>
					<ErrorBoundary resetKey='library'>
						<LibraryView
							animationsEnabled={library.animationsEnabled}
							connectionMode={library.connectionMode}
							downloadService={library.downloadService}
							gridColumns={library.gridColumns}
							imageCache={library.imageCache}
							modalSlot={library.modalSlot}
							onNavigationControllerReady={this.captureLibraryController}
							paletteQueue={library.paletteQueue}
							playbackStore={library.playbackStore}
							playlistEditService={library.playlistEditService}
							toastService={library.toastService}
							transport={library.transport}
						/>
					</ErrorBoundary>
				</view>

				<view style={this.tabStyle(FooterTabs.search)}>
					<ErrorBoundary resetKey='search'>
						<SearchTab
							onNavigationControllerReady={this.captureSearchController}
							search={this.viewModel.searchViewModel}
						/>
					</ErrorBoundary>
				</view>

				<view style={this.tabStyle(FooterTabs.settings)}>
					<ErrorBoundary resetKey='settings'>
						<SettingsTab
							downloadService={this.viewModel.downloadService}
							modalSlot={this.viewModel.modalSlot}
							paletteService={this.viewModel.paletteService}
							playbackOrchestrator={this.viewModel.playbackOrchestrator}
							preferences={this.viewModel.preferences}
							sessionController={this.viewModel.sessionController}
							toastService={this.viewModel.toastService}
							visible={appShellStore.activeFooterTab === FooterTabs.settings}
						/>
					</ErrorBoundary>
				</view>
			</view>

			<OverlayHost />
		</view>;
	}

	private captureHomeController = (controller: NavigationController): void => {
		appShellStore.registerController(FooterTabs.home, controller);
		this.claimAndroidBackIfReady();
	};

	private captureLibraryController = (controller: NavigationController): void => {
		appShellStore.registerController(FooterTabs.library, controller);
		this.claimAndroidBackIfReady();
	};

	private captureSearchController = (controller: NavigationController): void => {
		appShellStore.registerController(FooterTabs.search, controller);
		this.claimAndroidBackIfReady();
	};

	// Every tab stays mounted, so each tab's NavigationRoot grabs Android's single back observer
	// (Device.setBackButtonObserver, last-writer-wins) as it mounts — the last tab to render would
	// otherwise own Back. Re-claim it for the shell once every nav tab has reported its controller,
	// so Back routes to whichever tab is visible. This must run from inside a render (here, a tab's
	// onNavigationControllerReady callback): Device.setBackButtonObserver resolves the target from
	// ValdiContext.current(), which is null in a detached microtask, so the call would no-op there.
	// iOS keeps its native per-page swipe gesture (Device.setBackButtonObserver is Android-only).
	private claimAndroidBackIfReady(): void {
		if (
			this.androidBackObserverInstalled ||
			!Device.isAndroid() ||
			!appShellStore.areNavTabsReady()
		) {
			return;
		}
		Device.setBackButtonObserver(this.handleAndroidBack);
		this.androidBackObserverInstalled = true;
	}

	private handleAndroidBack = (): boolean => backNavRouter.goBack();

	private tabStyle(tab: FooterTab): Style<View> {
		return appShellStore.activeFooterTab === tab ? styles.tabVisible : styles.tabHidden;
	}
}

const styles = {
	tabHidden: new Style<View>({
		bottom: 0,
		left: '100%',
		opacity: 0,
		position: 'absolute',
		top: 0,
		width: '100%',
	}),
	tabVisible: new Style<View>({
		bottom: 0,
		left: 0,
		opacity: 1,
		position: 'absolute',
		top: 0,
		width: '100%',
	}),
};
