import type { PlaybackStore } from '../stores/Playback';

export type NativeAudioPlaybackEventAction = 'pause' | 'play' | '';

export interface NativeAudioCompletedEvent {
	finishedTrackId: string | null;
	isCompleted: boolean;
}

// Native emits "completed:<trackId>" carrying the track that finished so JS can reconcile
// deterministically after being frozen across several background transitions. Bare
// "completed" (older native builds) is still accepted as a single-step advance.
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

// Native emits "jumped:<trackId>" when it moved to a different track outside the normal
// forward advance (the notification's previous button stepping back through the engine's
// history). The id is the track that is NOW current.
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
