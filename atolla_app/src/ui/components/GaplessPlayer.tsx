import type { PlaybackStore } from 'atolla_player/src/stores/Playback';
import { Component } from 'valdi_core/src/Component';
import type { NativeAudioPlaybackError } from '../../services/NativeAudioPlaybackEventSync';
import { NativeAudioPlayer } from './NativeAudioPlayer';

export interface GaplessPlayerViewModel {
	activeSourceUrl: string | null;
	isPlaying: boolean;
	nextSourceUrl: string | null;
	onPlaybackError?: (error: NativeAudioPlaybackError) => void;
	onPlaybackEvent?: (event: string) => void;
	onTrackCompleted?: () => void;
	playbackStore: PlaybackStore;
}

export class GaplessPlayer extends Component<GaplessPlayerViewModel> {
	onRender(): void {
		const {
			activeSourceUrl,
			isPlaying,
			nextSourceUrl,
			onPlaybackError,
			onPlaybackEvent,
			onTrackCompleted,
			playbackStore,
		} = this.viewModel;

		<NativeAudioPlayer
			isActive
			isPlaying={isPlaying}
			nextPlaybackSourceUrl={nextSourceUrl}
			onPlaybackError={onPlaybackError}
			onPlaybackEvent={onPlaybackEvent}
			onTrackCompleted={onTrackCompleted}
			playbackSourceUrl={activeSourceUrl}
			playbackStore={playbackStore}
		/>;
	}
}
