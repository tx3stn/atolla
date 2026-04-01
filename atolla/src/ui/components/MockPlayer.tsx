// @ts-nocheck
import { Component } from 'valdi_core/src/Component';
import type { PlaybackStore } from '../../stores/Playback';

export interface MockPlayerViewModel {
	playbackStore: PlaybackStore;
}

export class MockPlayer extends Component<MockPlayerViewModel> {
	private _interval: ReturnType<typeof setInterval> | null = null;

	onCreate(): void {
		this._interval = setInterval(() => {
			const store = this.viewModel.playbackStore;
			if (store.isPlaying) {
				store.updateProgress(store.progressSeconds + 1);
			}
		}, 1000);
	}

	onDestroy(): void {
		if (this._interval !== null) {
			clearInterval(this._interval);
			this._interval = null;
		}
	}

	onRender(): void {}
}
