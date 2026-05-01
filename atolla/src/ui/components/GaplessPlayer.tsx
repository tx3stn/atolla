import { Component } from 'valdi_core/src/Component';
import type { PlaybackStore } from '../../stores/Playback';
import { NativeAudioPlayer } from './NativeAudioPlayer';

export interface GaplessPlayerViewModel {
	activeSourceUrl: string | null;
	nextSourceUrl: string | null;
	onPlaybackError?: (error: string) => void;
	onPlaybackEvent?: (event: string) => void;
	onTrackCompleted?: () => void;
	playbackStore: PlaybackStore;
}

export class GaplessPlayer extends Component<GaplessPlayerViewModel> {
	onRender(): void {
		const {
			activeSourceUrl,
			nextSourceUrl,
			onPlaybackError,
			onPlaybackEvent,
			onTrackCompleted,
			playbackStore,
		} = this.viewModel;

		<NativeAudioPlayer
			isActive
			nextPlaybackSourceUrl={nextSourceUrl}
			onPlaybackError={onPlaybackError}
			onPlaybackEvent={onPlaybackEvent}
			onTrackCompleted={onTrackCompleted}
			playbackSourceUrl={activeSourceUrl}
			playbackStore={playbackStore}
		/>;
	}
}
