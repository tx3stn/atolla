import type { PlaybackStore } from '../stores/Playback';

export type NativeAudioPlaybackEventAction = 'pause' | '';

export function normalizeNativeAudioPlaybackEventAction(
	rawEvent: string,
): NativeAudioPlaybackEventAction {
	const event = rawEvent.trim().toLowerCase();
	if (event === 'pause-requested') {
		return 'pause';
	}

	return '';
}

export function applyNativeAudioPlaybackEventAction(
	playbackStore: PlaybackStore,
	action: NativeAudioPlaybackEventAction,
): void {
	if (action !== 'pause') {
		return;
	}

	if (playbackStore.isPlaying) {
		playbackStore.playPause();
	}
}
