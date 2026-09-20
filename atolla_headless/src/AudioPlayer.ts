import type { Track } from 'atolla_core/src/models/Track';
import { getLogger } from 'atolla_core/src/services/Logger';
import {
	parseNativeAudioCompletedEvent,
	parseNativeAudioErrorEvent,
	parseNativeAudioJumpedEvent,
} from 'atolla_player/src/services/NativeAudioPlaybackEventSync';
import type { PlaybackStore } from 'atolla_player/src/stores/Playback';
import type { AudioEngine } from './Audio';
import type { ResolvedSource } from './SourceResolver';

export const POLL_INTERVAL_MS = 200;

// The native queue holds 32, so a drain that never empties is the engine misbehaving rather than a
// busy speaker.
const MAX_EVENTS_PER_TICK = 32;

// A dead credential fails every track, so advancing past each one burns the whole queue in a few
// seconds. Stopping leaves it on the track that failed.
const MAX_CONSECUTIVE_FAILURES = 3;

export interface AudioPlayerDeps {
	audio: AudioEngine;
	playback: PlaybackStore;
	resolveSource: (track: Track) => ResolvedSource | null;
}

export interface AudioPlayer {
	currentNativeTrack: () => { positionSeconds: number; trackId: string } | null;
	dispose: () => void;
	start: () => void;
	tick: () => void;
}

export function makeAudioPlayer({ audio, playback, resolveSource }: AudioPlayerDeps): AudioPlayer {
	const log = getLogger('audio');

	let unsubscribe: (() => void) | null = null;
	let consecutiveFailures = 0;
	let lastPlaying = false;
	let lastSeekTarget: number | null = null;

	const bindTrack = (): void => {
		const track = playback.track;

		if (track === undefined || track === null) {
			if (audio.currentTrackId() !== '') {
				audio.clear();
			}
			return;
		}

		// Rebinding a track the engine already holds restarts it mid-play.
		if (track.id === audio.currentTrackId()) {
			return;
		}

		const resolved = resolveSource(track);
		if (resolved === null) {
			log.warn('no source for track', { trackId: track.id });
			return;
		}

		if (!audio.configure(resolved.source, track.id, resolved.authHeader)) {
			log.warn('engine refused the track', { trackId: track.id });
			return;
		}

		lastPlaying = playback.isPlaying;
		audio.setPlaying(playback.isPlaying);
	};

	const applyPlaying = (): void => {
		if (playback.isPlaying === lastPlaying) {
			return;
		}

		lastPlaying = playback.isPlaying;
		audio.setPlaying(playback.isPlaying);
	};

	const applySeek = (): void => {
		const target = playback.seekTarget;

		if (target === null) {
			lastSeekTarget = null;
			return;
		}

		if (target === lastSeekTarget) {
			return;
		}

		lastSeekTarget = target;
		audio.seekToMs(Math.max(0, Math.floor(target * 1000)));
	};

	const apply = (): void => {
		// Before bindTrack, which assigns lastPlaying itself. Resuming clears the count, so a queue
		// the guard stopped can be retried.
		if (playback.isPlaying && !lastPlaying) {
			consecutiveFailures = 0;
		}

		bindTrack();
		applyPlaying();
		applySeek();
	};

	const drain = (): void => {
		for (let count = 0; count < MAX_EVENTS_PER_TICK; count++) {
			const event = audio.consumeEvent();
			if (event === '') {
				return;
			}

			const completed = parseNativeAudioCompletedEvent(event);
			if (completed.isCompleted) {
				if (completed.finishedTrackId === null) {
					playback.next();
				} else {
					playback.advancePastTrackId(completed.finishedTrackId);
				}
				continue;
			}

			const failure = parseNativeAudioErrorEvent(event);
			if (failure !== null) {
				consecutiveFailures++;
				log.warn('playback failed', {
					consecutiveFailures,
					message: failure.message,
					trackId: failure.trackId,
				});

				if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
					playback.setPlaying(false);
					continue;
				}

				if (failure.trackId !== null) {
					playback.advancePastTrackId(failure.trackId);
				}
				continue;
			}

			const jumped = parseNativeAudioJumpedEvent(event);
			if (jumped !== null) {
				playback.jumpToTrackId(jumped);
			}
		}
	};

	const readPosition = (): void => {
		const track = playback.track;
		if (track === undefined || track === null) {
			return;
		}

		// A position read while the engine holds another track would be applied to this one.
		if (audio.currentTrackId() !== track.id) {
			return;
		}

		const positionMs = audio.positionMs();
		if (!Number.isFinite(positionMs) || positionMs < 0) {
			return;
		}

		if (positionMs > 0) {
			consecutiveFailures = 0;
		}

		playback.updateProgress(positionMs / 1000);
	};

	return {
		currentNativeTrack: () => {
			const trackId = audio.currentTrackId();
			if (trackId === '') {
				return null;
			}

			const positionMs = audio.positionMs();

			return {
				positionSeconds: Number.isFinite(positionMs) && positionMs > 0 ? positionMs / 1000 : 0,
				trackId,
			};
		},
		dispose: () => {
			unsubscribe?.();
			unsubscribe = null;
		},
		start: () => {
			unsubscribe = playback.subscribe(apply);
			apply();
		},
		tick: () => {
			// Batched so several buffered completions settle as one notification, rather than walking
			// the engine through every intermediate track.
			playback.runBatched(drain);
			readPosition();
		},
	};
}
