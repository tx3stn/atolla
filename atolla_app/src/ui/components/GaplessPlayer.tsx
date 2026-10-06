import type { NativeAudioPlaybackError } from 'atolla_player/src/services/NativeAudioPlaybackEventSync';
import type { PlaybackStore } from 'atolla_player/src/stores/Playback';
import { StatefulComponent } from 'valdi_core/src/Component';
import type { FeatureFlags } from '../../FeatureFlags';
import type { PlayersStore } from '../../stores/Players';
import { NativeAudioPlayer } from './NativeAudioPlayer';

export interface GaplessPlayerViewModel {
	activeSourceUrl: string | null;
	featureFlags: FeatureFlags;
	isPlaying: boolean;
	nextSourceUrl: string | null;
	onPlaybackError?: (error: NativeAudioPlaybackError) => void;
	onPlaybackEvent?: (event: string) => void;
	onTrackCompleted?: () => void;
	playbackStore: PlaybackStore;
	playersStore: PlayersStore;
}

interface GaplessPlayerState {
	muted: boolean;
}

export class GaplessPlayer extends StatefulComponent<GaplessPlayerViewModel, GaplessPlayerState> {
	state: GaplessPlayerState = { muted: this.isMuted() };

	onCreate(): void {
		if (!this.viewModel.featureFlags.multiRoom) {
			return;
		}
		this.registerDisposable(this.viewModel.playersStore.subscribe(this.syncMuted));
	}

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
			volume={this.state.muted ? 0 : 1}
		/>;
	}

	private isMuted(): boolean {
		return (
			this.viewModel.featureFlags.multiRoom && !this.viewModel.playersStore.isThisDeviceEnabled()
		);
	}

	private syncMuted = (): void => {
		const muted = this.isMuted();
		if (muted !== this.state.muted) {
			this.setState({ muted });
		}
	};
}
