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

export type TrackPlaybackNotificationAction = 'next' | 'pause' | 'play' | 'previous' | 'stop' | '';

export function normalizeTrackPlaybackNotificationAction(
	rawAction: string,
): TrackPlaybackNotificationAction {
	const action = rawAction.trim().toLowerCase();
	if (
		action === 'play' ||
		action === 'pause' ||
		action === 'next' ||
		action === 'previous' ||
		action === 'stop'
	) {
		return action;
	}

	return '';
}

export function applyTrackPlaybackNotificationAction(
	playbackStore: PlaybackStore,
	action: TrackPlaybackNotificationAction,
): void {
	switch (action) {
		case 'play': {
			if (!playbackStore.isPlaying && playbackStore.track != null) {
				playbackStore.playPause();
			}
			break;
		}
		case 'pause': {
			if (playbackStore.isPlaying) {
				playbackStore.playPause();
			}
			break;
		}
		case 'next': {
			if (playbackStore.trackIndex < playbackStore.tracks.length - 1) {
				playbackStore.next();
			}
			break;
		}
		case 'previous': {
			if (playbackStore.trackIndex > 0) {
				playbackStore.previous();
			}
			break;
		}
		case 'stop': {
			playbackStore.stop();
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
