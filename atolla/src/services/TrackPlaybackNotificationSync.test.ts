import { describe, expect, it } from 'bun:test';
import type { Track } from '../models/Track';
import { PlaybackStore } from '../stores/Playback';
import {
	applyTrackPlaybackNotificationAction,
	buildTrackPlaybackNotificationPayload,
	normalizeTrackPlaybackNotificationAction,
} from './TrackPlaybackNotificationSync';

describe('TrackPlaybackNotificationSync', () => {
	it('builds payload for active track', () => {
		const store = new PlaybackStore();
		const tracks: Array<Track> = [
			{
				albumImageUrl: 'https://images.example/cover.jpg',
				albumName: 'Roadside',
				artistName: 'Aster',
				duration: 212,
				id: 'track-1',
				name: 'Night Drive',
			},
			{
				duration: 180,
				id: 'track-2',
				name: 'Second',
			},
		];

		store.playTracks(tracks, 0);
		store.updateProgress(17.3);

		const payload = buildTrackPlaybackNotificationPayload(store);

		expect(payload).not.toBeNull();
		expect(payload?.trackName).toBe('Night Drive');
		expect(payload?.artistName).toBe('Aster');
		expect(payload?.albumName).toBe('Roadside');
		expect(payload?.artworkUrl).toBe('https://images.example/cover.jpg');
		expect(payload?.hasPrevious).toBe(false);
		expect(payload?.hasNext).toBe(true);
		expect(payload?.positionBucket).toBe(17);
	});

	it('returns null payload when no active track', () => {
		const store = new PlaybackStore();

		expect(buildTrackPlaybackNotificationPayload(store)).toBeNull();
	});

	it('applies notification actions to playback store', () => {
		const store = new PlaybackStore();
		store.playTracks(
			[
				{ duration: 100, id: 'track-1', name: 'First' },
				{ duration: 100, id: 'track-2', name: 'Second' },
			],
			0,
		);

		applyTrackPlaybackNotificationAction(store, 'next');
		expect(store.track?.id).toBe('track-2');

		applyTrackPlaybackNotificationAction(store, 'previous');
		expect(store.track?.id).toBe('track-1');

		applyTrackPlaybackNotificationAction(store, 'pause');
		expect(store.isPlaying).toBe(false);

		applyTrackPlaybackNotificationAction(store, 'play');
		expect(store.isPlaying).toBe(true);

		applyTrackPlaybackNotificationAction(store, 'stop');
		expect(store.track).toBeNull();
	});

	it('normalizes native action payloads', () => {
		expect(normalizeTrackPlaybackNotificationAction(' PLAY ')).toBe('play');
		expect(normalizeTrackPlaybackNotificationAction('unknown')).toBe('');
	});
});
