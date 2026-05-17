import type { PlaybackStore } from '../stores/Playback';

export type NativeAudioPlaybackEventAction = 'pause' | 'play' | '';

export function normalizeNativeAudioPlaybackEventAction(
	rawEvent: string,
): NativeAudioPlaybackEventAction {
	const event = rawEvent.trim().toLowerCase();
	if (event === 'pause-requested') {
		return 'pause';
	}
	if (event === 'play-requested') {
		return 'play';
	}

	return '';
}

export function applyNativeAudioPlaybackEventAction(
	playbackStore: PlaybackStore,
	action: NativeAudioPlaybackEventAction,
): void {
	if (action === 'pause') {
		if (playbackStore.isPlaying) {
			playbackStore.playPause();
		}
		return;
	}

	if (action === 'play') {
		if (!playbackStore.isPlaying) {
			playbackStore.playPause();
		}
	}
}
