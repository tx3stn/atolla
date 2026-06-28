import { StatefulComponent } from 'valdi_core/src/Component';
import { Device } from 'valdi_core/src/Device';
import { Style } from 'valdi_core/src/Style';
import type { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';
import { DetachedSlotRenderer } from 'valdi_core/src/slot/DetachedSlotRenderer';
import type { NavigationController } from 'valdi_navigation/src/NavigationController';
import type { View } from 'valdi_tsx/src/NativeTemplateElements';
import { type FooterTab, FooterTabs } from './models/App';
import type { Playlist } from './models/Playlist';
import type { Track } from './models/Track';
import type { ArtworkPaletteService } from './services/ArtworkPaletteService';
import { backNavRouter } from './services/BackNavRouter';
import type { NavCoordinator } from './services/NavCoordinator';
import type { PlaybackOrchestrator } from './services/PlaybackOrchestrator';
import type { ToastService } from './services/ToastService';
import type { BarColorStore } from './stores/BarColor';
import type { PlaybackStore } from './stores/Playback';
import type { LanguageCode } from './stores/Preferences';
import { theme } from './theme';
import { type ConnectionMode, ConnectionModes } from './transports/Model';
import type { Transport } from './transports/Transport';
import { ErrorBoundary } from './ui/components/ErrorBoundary';
import { Floating } from './ui/components/Floating';
import { FooterNav } from './ui/components/FooterNav';
import { GaplessPlayer } from './ui/components/GaplessPlayer';
import { MockPlayer } from './ui/components/MockPlayer';
import { NowPlayingSurface } from './ui/components/NowPlayingSurface';
import { HomeTab, type HomeTabViewModel } from './ui/tabs/Home';
import { type LibraryViewModel, V2LibraryView } from './ui/tabs/Library';
import { SearchTab } from './ui/tabs/Search';
import { SettingsTab } from './ui/tabs/Settings';
import type { SearchViewModel } from './ui/views/SearchView';
import type { SettingsViewModel } from './ui/views/SettingsView';

export interface AuthedAppViewModel {
	animationsEnabled: boolean;
	barColors: BarColorStore;
	connectionMode: ConnectionMode;
	downloadingCount: number;
	homeViewModel: HomeTabViewModel;
	language: LanguageCode;
	libraryViewModel: Omit<LibraryViewModel, 'navCoordinator' | 'onNavigationControllerReady'>;
	modalSlot: DetachedSlot;
	navCoordinator: NavCoordinator;
	onNowPlayingAlbumTap: (track?: Track) => void;
	onNowPlayingArtistTap: (track?: Track) => void;
	onNowPlayingOpenPlaylist: (playlist: Playlist) => void;
	paletteService: ArtworkPaletteService;
	playbackOrchestrator: PlaybackOrchestrator;
	playbackStore: PlaybackStore;
	searchViewModel: Omit<SearchViewModel, 'navigationController'>;
	settingsViewModel: SettingsViewModel;
	toastService: ToastService;
	toastSlot: DetachedSlot;
	transport: Transport;
}

export interface AuthedAppState {
	activeFooterTab: FooterTab;
	nowPlayingCollapseSignal: number;
}

export class AuthedApp extends StatefulComponent<AuthedAppViewModel, AuthedAppState> {
	state: AuthedAppState = { activeFooterTab: FooterTabs.home, nowPlayingCollapseSignal: 0 };

	private readonly tabNavControllers: Partial<Record<FooterTab, NavigationController>> = {};
	private androidBackObserverInstalled = false;

	onCreate(): void {
		backNavRouter.setActiveTab(this.state.activeFooterTab);
		this.viewModel.navCoordinator.setShellNavigator(() => {
			backNavRouter.setActiveTab(FooterTabs.library);
			this.setState({ activeFooterTab: FooterTabs.library });
		});
	}

	onDestroy(): void {
		this.viewModel.navCoordinator.setShellNavigator(null);
		if (this.androidBackObserverInstalled) {
			Device.setBackButtonObserver(undefined);
		}
	}

	onRender(): void {
		const { track, album, isPlaying, loopMode, artistLogoUrl, tracks, trackIndex } =
			this.viewModel.playbackStore;
		const palette = this.viewModel.paletteService.getPalette(
			track?.albumImageUrl ?? album?.imageUrl,
		);
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
							onRequestModeChange={home.onRequestModeChange}
							onThisDayService={home.onThisDayService}
							paletteQueue={home.paletteQueue}
							playbackStore={home.playbackStore}
							playlistEditService={home.playlistEditService}
							recentlyAddedService={home.recentlyAddedService}
							recentlyPlayedTracks={home.recentlyPlayedTracks}
							toastService={home.toastService}
							transport={home.transport}
						/>
					</ErrorBoundary>
				</view>

				<view style={this.tabStyle(FooterTabs.library)}>
					<ErrorBoundary resetKey='library'>
						<V2LibraryView
							animationsEnabled={library.animationsEnabled}
							connectionMode={library.connectionMode}
							downloadService={library.downloadService}
							gridColumns={library.gridColumns}
							imageCache={library.imageCache}
							modalSlot={library.modalSlot}
							navCoordinator={this.viewModel.navCoordinator}
							onNavigationControllerReady={this.captureLibraryController}
							onRequestModeChange={library.onRequestModeChange}
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
							navCoordinator={this.viewModel.navCoordinator}
							onNavigationControllerReady={this.captureSearchController}
							search={this.viewModel.searchViewModel}
						/>
					</ErrorBoundary>
				</view>

				<view style={this.tabStyle(FooterTabs.settings)}>
					<ErrorBoundary resetKey='settings'>
						<SettingsTab settings={this.viewModel.settingsViewModel} />
					</ErrorBoundary>
				</view>

				{track && (
					<Floating>
						<ErrorBoundary resetKey={track.id}>
							<NowPlayingSurface
								album={album}
								animationsEnabled={this.viewModel.animationsEnabled}
								artistLogoUrl={artistLogoUrl}
								barColors={this.viewModel.barColors}
								collapseSignal={this.state.nowPlayingCollapseSignal}
								isPlaying={isPlaying}
								language={this.viewModel.language}
								loopMode={loopMode}
								onAlbumTap={this.viewModel.onNowPlayingAlbumTap}
								onArtistTap={this.viewModel.onNowPlayingArtistTap}
								onOpenPlaylist={this.viewModel.onNowPlayingOpenPlaylist}
								palette={palette}
								playbackStore={this.viewModel.playbackStore}
								toastService={this.viewModel.toastService}
								track={track}
								trackIndex={trackIndex}
								tracks={tracks}
								transport={this.viewModel.transport}
								waveformMaskUrl={this.viewModel.playbackOrchestrator.getWaveformMaskUrl(track.id)}
							/>
						</ErrorBoundary>
					</Floating>
				)}
			</view>

			<Floating>
				<FooterNav
					activeTab={this.state.activeFooterTab}
					barColors={this.viewModel.barColors}
					downloadingCount={this.viewModel.downloadingCount}
					onFooterTabTap={this.handleFooterTabTap}
				/>
			</Floating>

			<DetachedSlotRenderer detachedSlot={this.viewModel.modalSlot} />
			<DetachedSlotRenderer detachedSlot={this.viewModel.toastSlot} />
		</view>;
	}

	private handleFooterTabTap = (tab: FooterTab): void => {
		// iOS pushes details full-screen onto the one root nav controller, so an open detail covers
		// the tabs; pop the current tab back to its root so the tapped tab is actually revealed.
		// (Android keeps a separate stack per tab, so the target tab already shows on switch.)
		if (!Device.isAndroid()) {
			this.tabNavControllers[this.state.activeFooterTab]?.popToSelf(false);
		}
		backNavRouter.setActiveTab(tab);
		this.setState({ activeFooterTab: tab });
	};

	private handleAndroidBack = (): boolean => backNavRouter.goBack();

	private captureHomeController = (controller: NavigationController): void => {
		this.tabNavControllers[FooterTabs.home] = controller;
		this.viewModel.homeViewModel.onNavigationControllerReady(controller);
		this.claimAndroidBackIfReady();
	};

	private captureLibraryController = (controller: NavigationController): void => {
		this.tabNavControllers[FooterTabs.library] = controller;
		this.claimAndroidBackIfReady();
	};

	private captureSearchController = (controller: NavigationController): void => {
		this.tabNavControllers[FooterTabs.search] = controller;
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
			!this.tabNavControllers[FooterTabs.home] ||
			!this.tabNavControllers[FooterTabs.library] ||
			!this.tabNavControllers[FooterTabs.search]
		) {
			return;
		}
		Device.setBackButtonObserver(this.handleAndroidBack);
		this.androidBackObserverInstalled = true;
	}

	private tabStyle(tab: FooterTab): Style<View> {
		return this.state.activeFooterTab === tab ? styles.tabVisible : styles.tabHidden;
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
