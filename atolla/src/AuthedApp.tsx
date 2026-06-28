import { StatefulComponent } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';
import { DetachedSlotRenderer } from 'valdi_core/src/slot/DetachedSlotRenderer';
import type { NavigationController } from 'valdi_navigation/src/NavigationController';
import type { View } from 'valdi_tsx/src/NativeTemplateElements';
import { type FooterTab, FooterTabs } from './models/App';
import type { Playlist } from './models/Playlist';
import type { Track } from './models/Track';
import type { ArtworkPaletteService } from './services/ArtworkPaletteService';
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
import { HomeTab } from './ui/tabs/Home';
import { type LibraryViewModel, V2LibraryView } from './ui/tabs/Library';
import { SearchTab } from './ui/tabs/Search';
import { SettingsTab } from './ui/tabs/Settings';
import type { HomeViewModel } from './ui/views/HomeView';
import type { SearchViewModel } from './ui/views/SearchView';
import type { SettingsViewModel } from './ui/views/SettingsView';

export interface AuthedAppViewModel {
	animationsEnabled: boolean;
	barColors: BarColorStore;
	connectionMode: ConnectionMode;
	downloadingCount: number;
	homeViewModel: HomeViewModel;
	language: LanguageCode;
	libraryViewModel: LibraryViewModel;
	modalSlot: DetachedSlot;
	onHomeNavigationControllerReady: (controller: NavigationController) => void;
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

	onRender(): void {
		const { track, album, isPlaying, loopMode, artistLogoUrl, tracks, trackIndex } =
			this.viewModel.playbackStore;
		const palette = this.viewModel.paletteService.getPalette(
			track?.albumImageUrl ?? album?.imageUrl,
		);
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
							home={this.viewModel.homeViewModel}
							onNavigationControllerReady={this.viewModel.onHomeNavigationControllerReady}
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
						<SearchTab search={this.viewModel.searchViewModel} />
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
		this.setState({ activeFooterTab: tab });
	};

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
