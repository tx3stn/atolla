import type { PlaybackStore } from '../stores/Playback';
import type { PendingScrobble } from './ScrobbleService';

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

// native readAtollaPendingScrobbles() returns a JSON array [{ trackId, playedAtMs }]; parse
// defensively (native/desktop stubs may return "" or malformed data) and drop invalid entries
export function parseNativePendingScrobbles(rawJson: string): Array<PendingScrobble> {
	if (!rawJson) {
		return [];
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(rawJson);
	} catch {
		return [];
	}
	if (!Array.isArray(parsed)) {
		return [];
	}

	const scrobbles: Array<PendingScrobble> = [];
	for (const entry of parsed) {
		if (!entry || typeof entry !== 'object') {
			continue;
		}
		const candidate = entry as { playedAtMs?: unknown; trackId?: unknown };
		if (
			typeof candidate.trackId === 'string' &&
			candidate.trackId.length > 0 &&
			typeof candidate.playedAtMs === 'number' &&
			Number.isFinite(candidate.playedAtMs)
		) {
			scrobbles.push({ playedAtMs: candidate.playedAtMs, trackId: candidate.trackId });
		}
	}
	return scrobbles;
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
