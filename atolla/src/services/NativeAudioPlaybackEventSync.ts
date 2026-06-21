import type { PlaybackStore } from '../stores/Playback';

export type NativeAudioPlaybackEventAction = 'pause' | 'play' | '';

export interface NativeAudioCompletedEvent {
	finishedTrackId: string | null;
	isCompleted: boolean;
}

// native emits "completed:<trackId>" so JS can reconcile after being frozen across
// background transitions. bare "completed" (older builds) is a single-step advance
export function parseNativeAudioCompletedEvent(rawEvent: string): NativeAudioCompletedEvent {
	if (rawEvent === 'completed') {
		return { finishedTrackId: null, isCompleted: true };
	}

	if (rawEvent.startsWith('completed:')) {
		const finishedTrackId = rawEvent.slice('completed:'.length).trim();
		return { finishedTrackId: finishedTrackId || null, isCompleted: true };
	}

	return { finishedTrackId: null, isCompleted: false };
}

// native emits "jumped:<trackId>" when it moves outside the normal forward advance
// (e.g. the notification's previous button). the id is the track now current
export function parseNativeAudioJumpedEvent(rawEvent: string): string | null {
	if (!rawEvent.startsWith('jumped:')) {
		return null;
	}

	const trackId = rawEvent.slice('jumped:'.length).trim();
	return trackId || null;
}

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
