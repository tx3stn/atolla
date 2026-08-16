import type { PlaybackStore } from '../stores/Playback';

export interface TrackPlaybackNotificationPayload {
	albumName: string;
	artistName: string;
	artworkUrl: string;
	durationSeconds: number;
	hasNext: boolean;
	hasPrevious: boolean;
	isPlaying: boolean;
	positionBucket: number;
	positionSeconds: number;
	stateKey: string;
	trackName: string;
}

export const TrackNotificationActions = {
	next: 'next',
	pause: 'pause',
	play: 'play',
	previous: 'previous',
	stop: 'stop',
	toggle: 'toggle',
} as const;

export type TrackNotificationAction =
	(typeof TrackNotificationActions)[keyof typeof TrackNotificationActions];

export function normalizeTrackPlaybackNotificationAction(
	rawAction: string,
): TrackNotificationAction | null {
	const action = rawAction.trim().toLowerCase();
	if (
		action === TrackNotificationActions.play ||
		action === TrackNotificationActions.pause ||
		action === TrackNotificationActions.next ||
		action === TrackNotificationActions.previous ||
		action === TrackNotificationActions.stop ||
		action === TrackNotificationActions.toggle
	) {
		return action;
	}

	return null;
}

export function applyTrackPlaybackNotificationAction(
	playbackStore: PlaybackStore,
	action: TrackNotificationAction,
): void {
	switch (action) {
		case TrackNotificationActions.play: {
			if (!playbackStore.isPlaying && playbackStore.track != null) {
				playbackStore.playPause();
			}
			break;
		}
		case TrackNotificationActions.pause: {
			if (playbackStore.isPlaying) {
				playbackStore.playPause();
			}
			break;
		}
		case TrackNotificationActions.next: {
			if (playbackStore.trackIndex < playbackStore.tracks.length - 1) {
				playbackStore.next();
			}
			break;
		}
		case TrackNotificationActions.previous: {
			playbackStore.previousOrRestart();
			break;
		}
		case TrackNotificationActions.stop: {
			playbackStore.stop();
			break;
		}
		case TrackNotificationActions.toggle: {
			if (playbackStore.track != null) {
				playbackStore.playPause();
			}
			break;
		}
	}
}

export function buildTrackPlaybackNotificationPayload(
	playbackStore: PlaybackStore,
): TrackPlaybackNotificationPayload | null {
	const track = playbackStore.track;
	if (!track) {
		return null;
	}

	const hasPrevious = playbackStore.trackIndex > 0;
	const hasNext = playbackStore.trackIndex < playbackStore.tracks.length - 1;
	const trackName = track.name ?? 'Track';
	const artistName = track.artistName ?? playbackStore.album?.artistName ?? '';
	const albumName = track.albumName ?? playbackStore.album?.name ?? '';
	const artworkUrl = track.albumImageUrl ?? playbackStore.album?.imageUrl ?? '';
	const durationSeconds = Number.isFinite(track.duration) ? track.duration : 0;
	const positionSeconds = Number.isFinite(playbackStore.progressSeconds)
		? playbackStore.progressSeconds
		: 0;

	const stateKey = JSON.stringify([
		track.id,
		trackName,
		artistName,
		albumName,
		artworkUrl,
		playbackStore.isPlaying,
		durationSeconds,
		hasPrevious,
		hasNext,
	]);

	return {
		albumName,
		artistName,
		artworkUrl,
		durationSeconds,
		hasNext,
		hasPrevious,
		isPlaying: playbackStore.isPlaying,
		positionBucket: Math.floor(positionSeconds),
		positionSeconds,
		stateKey,
		trackName,
	};
}
