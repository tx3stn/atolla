import { Component } from 'valdi_core/src/Component';
import type { PlaybackStore } from '../../stores/Playback';

export interface MockPlayerViewModel {
	playbackStore: PlaybackStore;
}

export class MockPlayer extends Component<MockPlayerViewModel> {
	private interval: ReturnType<typeof setInterval> | null = null;

	onCreate(): void {
		this.interval = setInterval(() => {
			const store = this.viewModel.playbackStore;
			if (store.isPlaying) {
				store.updateProgress(store.progressSeconds + 1);
			}
		}, 1000);
	}

	onDestroy(): void {
		if (this.interval != null) {
			clearInterval(this.interval);
			this.interval = null;
		}
	}

	onRender(): void {}
}
