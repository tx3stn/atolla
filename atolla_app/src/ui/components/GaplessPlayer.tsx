import type { PlaybackStore } from 'atolla_player/src/stores/Playback';
import { Component } from 'valdi_core/src/Component';
import type { NativeAudioPlaybackError } from '../../services/NativeAudioPlaybackEventSync';
import { NativeAudioPlayer } from './NativeAudioPlayer';

export interface GaplessPlayerViewModel {
	activeSourceUrl: string | null;
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
