import { StatefulComponent } from 'valdi_core/src/Component';
import type { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';
import { DetachedSlotRenderer } from 'valdi_core/src/slot/DetachedSlotRenderer';
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
import { FooterNav } from './ui/components/FooterNav';
import { GaplessPlayer } from './ui/components/GaplessPlayer';
import { MockPlayer } from './ui/components/MockPlayer';
import { NowPlayingSurface } from './ui/components/NowPlayingSurface';

export interface AuthedAppViewModel {
	animationsEnabled: boolean;
	barColors: BarColorStore;
	connectionMode: ConnectionMode;
	downloadingCount: number;
	language: LanguageCode;
	modalSlot: DetachedSlot;
	onNowPlayingAlbumTap: (track?: Track) => void;
	onNowPlayingArtistTap: (track?: Track) => void;
	onNowPlayingOpenPlaylist: (playlist: Playlist) => void;
	paletteService: ArtworkPaletteService;
	playbackOrchestrator: PlaybackOrchestrator;
	playbackStore: PlaybackStore;
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

	private handleFooterTabTap = (tab: FooterTab): void => {
		this.setState({ activeFooterTab: tab });
	};

	onRender(): void {
		const { track, album, isPlaying, loopMode, artistLogoUrl, tracks, trackIndex } =
			this.viewModel.playbackStore;
		const palette = this.viewModel.paletteService.getPalette(
			track?.albumImageUrl ?? album?.imageUrl,
		);

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
				{/* Actual body content - home, library, search, settings */}
				{track && (
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
				)}
			</view>

			<FooterNav
				activeTab={this.state.activeFooterTab}
				barColors={this.viewModel.barColors}
				downloadingCount={this.viewModel.downloadingCount}
				onFooterTabTap={this.handleFooterTabTap}
			/>

			<DetachedSlotRenderer detachedSlot={this.viewModel.modalSlot} />
			<DetachedSlotRenderer detachedSlot={this.viewModel.toastSlot} />
		</view>;
	}
}
