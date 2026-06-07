import { describe, expect, it } from 'bun:test';
import { PlaybackStore } from '../stores/Playback';
import {
	applyNativeAudioPlaybackEventAction,
	normalizeNativeAudioPlaybackEventAction,
	parseNativeAudioCompletedEvent,
	parseNativeAudioJumpedEvent,
} from './NativeAudioPlaybackEventSync';

describe('NativeAudioPlaybackEventSync', () => {
	it('normalizes pause interruption event', () => {
		expect(normalizeNativeAudioPlaybackEventAction(' pause-requested ')).toBe('pause');
		expect(normalizeNativeAudioPlaybackEventAction('completed')).toBe('');
	});

	it('parses a bare completed event without a track id', () => {
		expect(parseNativeAudioCompletedEvent('completed')).toEqual({
			finishedTrackId: null,
			isCompleted: true,
		});
	});

	it('parses the finished track id from a completed event', () => {
		expect(parseNativeAudioCompletedEvent('completed:abc123')).toEqual({
			finishedTrackId: 'abc123',
			isCompleted: true,
		});
	});

	it('treats a completed event with an empty id as bare', () => {
		expect(parseNativeAudioCompletedEvent('completed:')).toEqual({
			finishedTrackId: null,
			isCompleted: true,
		});
	});

	it('does not match other events', () => {
		expect(parseNativeAudioCompletedEvent('loaded').isCompleted).toBe(false);
		expect(parseNativeAudioCompletedEvent('error:completed').isCompleted).toBe(false);
		expect(parseNativeAudioCompletedEvent('').isCompleted).toBe(false);
	});

	it('parses the track id from a jumped event', () => {
		expect(parseNativeAudioJumpedEvent('jumped:abc123')).toBe('abc123');
	});

	it('returns null for jumped events without an id and other events', () => {
		expect(parseNativeAudioJumpedEvent('jumped:')).toBeNull();
		expect(parseNativeAudioJumpedEvent('completed:abc')).toBeNull();
		expect(parseNativeAudioJumpedEvent('')).toBeNull();
	});

	it('pauses playback store on pause action only when playing', () => {
		const store = new PlaybackStore();
		store.playTracks([{ duration: 100, id: 'track-1', name: 'First' }], 0);

		applyNativeAudioPlaybackEventAction(store, 'pause');
		expect(store.isPlaying).toBe(false);

		applyNativeAudioPlaybackEventAction(store, 'pause');
		expect(store.isPlaying).toBe(false);
	});
});
