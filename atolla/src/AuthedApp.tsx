import { StatefulComponent } from 'valdi_core/src/Component';
import { Device } from 'valdi_core/src/Device';
import { Style } from 'valdi_core/src/Style';
import type { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';
import { DetachedSlotRenderer } from 'valdi_core/src/slot/DetachedSlotRenderer';
import type { NavigationController } from 'valdi_navigation/src/NavigationController';
import type { View } from 'valdi_tsx/src/NativeTemplateElements';
import type { Album } from './models/Album';
import { type FooterTab, FooterTabs, type HeaderTab } from './models/App';
import type { Artist } from './models/Artist';
import type { Playlist } from './models/Playlist';
import type { Track } from './models/Track';
import Strings from './Strings';
import type { ArtworkPaletteService } from './services/ArtworkPaletteService';
import { backNavRouter } from './services/BackNavRouter';
import type { DownloadService } from './services/DownloadService';
import type { ImageCache } from './services/ImageCache';
import type { PaletteGenerationQueue } from './services/PaletteGenerationQueue';
import type { PlaybackOrchestrator } from './services/PlaybackOrchestrator';
import type { SessionController } from './services/SessionController';
import type { ToastService } from './services/ToastService';
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
import { type DetailPushDeps, pushAlbum, pushArtist, pushPlaylist } from './ui/flows/PushDetail';
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
	activeFooterTab: FooterTab;
	nowPlayingCollapseSignal: number;
}

export class AuthedApp extends StatefulComponent<AuthedAppViewModel, AuthedAppState> {
	state: AuthedAppState = { activeFooterTab: FooterTabs.home, nowPlayingCollapseSignal: 0 };

	private androidBackObserverInstalled = false;
	private readonly tabNavControllers: Partial<Record<FooterTab, NavigationController>> = {};

	onCreate(): void {
		backNavRouter.setActiveTab(this.state.activeFooterTab);
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
							visible={this.state.activeFooterTab === FooterTabs.settings}
						/>
					</ErrorBoundary>
				</view>
			</view>

			<Floating>
				<AppHeader
					activeFooterTab={this.state.activeFooterTab}
					animationsEnabled={this.viewModel.animationsEnabled}
					connectionMode={this.viewModel.connectionMode}
					onDetailSectionTap={this.handleDetailSectionTap}
					onRequestModeChange={this.viewModel.onRequestModeChange}
				/>
				{track && (
					<ErrorBoundary resetKey={track.id}>
						<NowPlayingSurface
							album={album}
							animationsEnabled={this.viewModel.animationsEnabled}
							artistLogoUrl={artistLogoUrl}
							barColors={this.viewModel.barColors}
							collapseSignal={this.state.nowPlayingCollapseSignal}
							gridColumns={this.viewModel.gridColumns}
							imageCache={this.viewModel.imageCache}
							isPlaying={isPlaying}
							language={this.viewModel.language}
							loopMode={loopMode}
							modalSlot={this.viewModel.modalSlot}
							onAlbumTap={this.handleNowPlayingAlbumTap}
							onArtistTap={this.handleNowPlayingArtistTap}
							onOpenPlaylist={this.handleNowPlayingOpenPlaylist}
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
					activeTab={this.state.activeFooterTab}
					barColors={this.viewModel.barColors}
					downloadingCount={this.viewModel.downloadingCount}
					onFooterTabTap={this.handleFooterTabTap}
				/>
				<DetachedSlotRenderer detachedSlot={this.viewModel.modalSlot} />
				<DetachedSlotRenderer detachedSlot={this.viewModel.toastSlot} />
			</Floating>
		</view>;
	}

	private albumFromTrack(track: Track | null | undefined): Album | null {
		if (!track?.albumId) {
			return null;
		}
		return {
			artistId: track.artistId ?? '',
			artistName: track.artistName ?? '',
			id: track.albumId,
			imageUrl: track.albumImageUrl,
			name: track.albumName ?? '',
			releaseDate: track.releaseDate,
		};
	}

	private captureHomeController = (controller: NavigationController): void => {
		this.tabNavControllers[FooterTabs.home] = controller;
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

	private dismissDetail(tab: FooterTab): void {
		// iOS unwinds the tab's whole detail stack via its root controller; Android's JS navigator
		// throws on popToSelf, so pop the tab's first detail (removing it and everything above it).
		if (!Device.isAndroid()) {
			this.tabNavControllers[tab]?.popToSelf(false);
		} else {
			backNavRouter.firstPageOf(tab)?.pop(false);
		}
	}

	private handleAndroidBack = (): boolean => backNavRouter.goBack();

	// A Library section tab tapped from a detail's header: dismiss the detail and land on that section.
	private handleDetailSectionTap = (tab: HeaderTab): void => {
		const origin = this.state.activeFooterTab;
		this.dismissDetail(origin);
		if (origin !== FooterTabs.library) {
			this.dismissDetail(FooterTabs.library);
			backNavRouter.setActiveTab(FooterTabs.library);
			this.setState({ activeFooterTab: FooterTabs.library });
		}
		const descriptor = headerStore.descriptorFor(FooterTabs.library);
		if (descriptor?.kind === 'library') {
			descriptor.onTabTap(tab);
		}
	};

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

	private detailDeps(): DetailPushDeps {
		return {
			animationsEnabled: this.viewModel.animationsEnabled,
			downloadService: this.viewModel.downloadService,
			gridColumns: this.viewModel.gridColumns,
			imageCache: this.viewModel.imageCache,
			modalSlot: this.viewModel.modalSlot,
			onNavigateToArtist: this.handleDetailArtistTap,
			paletteQueue: this.viewModel.paletteQueue,
			playbackStore: this.viewModel.playbackStore,
			toastService: this.viewModel.toastService,
			transport: this.viewModel.transport,
		};
	}

	private handleDetailArtistTap = (artistId: string): void => {
		this.viewModel.transport
			.getArtist(artistId)
			.then((artist) => {
				if (!artist || this.isDestroyed()) {
					return;
				}
				this.pushIntoActiveTab((controller, deps) => pushArtist(controller, deps, artist));
			})
			.catch(() => {});
	};

	private handleNowPlayingAlbumTap = (track?: Track): void => {
		const { album, track: playing } = this.viewModel.playbackStore;
		const resolvedAlbum = track
			? this.albumFromTrack(track)
			: (album ?? this.albumFromTrack(playing));
		if (!resolvedAlbum) {
			return;
		}
		this.pushIntoActiveTab((controller, deps) => pushAlbum(controller, deps, resolvedAlbum));
	};

	private handleNowPlayingArtistTap = (track?: Track): void => {
		const artist = this.resolveNowPlayingArtist(track);
		if (!artist) {
			return;
		}
		this.pushIntoActiveTab((controller, deps) => pushArtist(controller, deps, artist));
	};

	private handleNowPlayingOpenPlaylist = (playlist: Playlist): void => {
		this.pushIntoActiveTab((controller, deps) => pushPlaylist(controller, deps, playlist));
	};

	// Now-playing details push onto the active tab; Settings has no nav stack, so fall back to Library.
	private pushIntoActiveTab(
		push: (controller: NavigationController, deps: DetailPushDeps) => void,
	): void {
		const controller = this.tabNavControllers[this.state.activeFooterTab];
		if (controller) {
			push(controller, this.detailDeps());
			return;
		}
		const libraryController = this.tabNavControllers[FooterTabs.library];
		if (!libraryController) {
			return;
		}
		backNavRouter.setActiveTab(FooterTabs.library);
		this.setState({ activeFooterTab: FooterTabs.library });
		push(libraryController, this.detailDeps());
	}

	private resolveNowPlayingArtist(track?: Track): Artist | null {
		if (track) {
			if (!track.artistId) {
				return null;
			}
			return { id: track.artistId, name: track.artistName ?? 'Unknown Artist' } as Artist;
		}
		const { album, artistLogoUrl, track: playing } = this.viewModel.playbackStore;
		const artistId = playing?.artistId ?? album?.artistId;
		if (!artistId) {
			return null;
		}
		return {
			id: artistId,
			logoUrl: artistLogoUrl ?? undefined,
			name: playing?.artistName ?? album?.artistName ?? 'Unknown Artist',
		} as Artist;
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
