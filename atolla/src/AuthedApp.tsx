import { StatefulComponent } from 'valdi_core/src/Component';
import { Device } from 'valdi_core/src/Device';
import { Style } from 'valdi_core/src/Style';
import type { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';
import { DetachedSlotRenderer } from 'valdi_core/src/slot/DetachedSlotRenderer';
import type { NavigationController } from 'valdi_navigation/src/NavigationController';
import type { View } from 'valdi_tsx/src/NativeTemplateElements';
import { type FooterTab, FooterTabs } from './models/App';
import Strings from './Strings';
import type { ArtworkPaletteService } from './services/ArtworkPaletteService';
import { backNavRouter } from './services/BackNavRouter';
import type { DownloadService } from './services/DownloadService';
import type { ImageCache } from './services/ImageCache';
import type { PaletteGenerationQueue } from './services/PaletteGenerationQueue';
import type { PlaybackOrchestrator } from './services/PlaybackOrchestrator';
import type { SessionController } from './services/SessionController';
import type { ToastService } from './services/ToastService';
import { appShellStore } from './stores/AppShell';
import type { BarColorStore } from './stores/BarColor';
import { headerStore } from './stores/Header';
import type { PlaybackStore } from './stores/Playback';
import type { LanguageCode, Preferences } from './stores/Preferences';
import { theme } from './theme';
import { type ConnectionMode, ConnectionModes } from './transports/Model';
import type { Transport } from './transports/Transport';
import { AppHeader } from './ui/components/AppHeader';
import { ErrorBoundary } from './ui/components/ErrorBoundary';
import { Floating } from './ui/components/Floating';
import { FooterNav } from './ui/components/FooterNav';
import { GaplessPlayer } from './ui/components/GaplessPlayer';
import { MockPlayer } from './ui/components/MockPlayer';
import { NowPlayingSurface } from './ui/components/NowPlayingSurface';
import { HomeTab, type HomeTabViewModel } from './ui/tabs/Home';
import { LibraryView, type LibraryViewModel } from './ui/tabs/Library';
import { SearchTab } from './ui/tabs/Search';
import { SettingsTab } from './ui/tabs/Settings';
import type { SearchViewModel } from './ui/views/SearchView';

export interface AuthedAppViewModel {
	animationsEnabled: boolean;
	barColors: BarColorStore;
	connectionMode: ConnectionMode;
	downloadingCount: number;
	downloadService: DownloadService;
	gridColumns: number;
	homeViewModel: Omit<HomeTabViewModel, 'onNavigationControllerReady'>;
	imageCache: ImageCache;
	language: LanguageCode;
	libraryViewModel: Omit<LibraryViewModel, 'onNavigationControllerReady'>;
	modalSlot: DetachedSlot;
	onRequestModeChange: (mode: ConnectionMode) => Promise<boolean>;
	paletteQueue: PaletteGenerationQueue;
	paletteService: ArtworkPaletteService;
	playbackOrchestrator: PlaybackOrchestrator;
	playbackStore: PlaybackStore;
	preferences: Preferences;
	searchViewModel: Omit<SearchViewModel, 'navigationController'>;
	sessionController: SessionController;
	toastService: ToastService;
	toastSlot: DetachedSlot;
	transport: Transport;
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

			<Floating>
				<AppHeader
					activeFooterTab={appShellStore.activeFooterTab}
					animationsEnabled={this.viewModel.animationsEnabled}
					connectionMode={this.viewModel.connectionMode}
					onDetailSectionTap={appShellStore.handleDetailSectionTap}
					onRequestModeChange={this.viewModel.onRequestModeChange}
				/>
				{track && (
					<ErrorBoundary resetKey={track.id}>
						<NowPlayingSurface
							album={album}
							animationsEnabled={this.viewModel.animationsEnabled}
							artistLogoUrl={artistLogoUrl}
							barColors={this.viewModel.barColors}
							collapseSignal={appShellStore.nowPlayingCollapseSignal}
							gridColumns={this.viewModel.gridColumns}
							imageCache={this.viewModel.imageCache}
							isPlaying={isPlaying}
							language={this.viewModel.language}
							loopMode={loopMode}
							modalSlot={this.viewModel.modalSlot}
							onAlbumTap={appShellStore.handleNowPlayingAlbumTap}
							onArtistTap={appShellStore.handleNowPlayingArtistTap}
							onOpenPlaylist={appShellStore.handleNowPlayingOpenPlaylist}
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
				)}
				<FooterNav
					activeTab={appShellStore.activeFooterTab}
					barColors={this.viewModel.barColors}
					downloadingCount={this.viewModel.downloadingCount}
					onFooterTabTap={appShellStore.handleFooterTabTap}
				/>
				<DetachedSlotRenderer detachedSlot={this.viewModel.modalSlot} />
				<DetachedSlotRenderer detachedSlot={this.viewModel.toastSlot} />
			</Floating>
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
