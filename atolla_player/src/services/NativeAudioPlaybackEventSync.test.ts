import { describe, expect, it } from 'bun:test';
import { PlaybackStore } from '../stores/Playback';
import {
	applyNativeAudioPlaybackEventAction,
	normalizeNativeAudioPlaybackEventAction,
	parseNativeAudioCompletedEvent,
	parseNativeAudioErrorEvent,
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

	it('parses the kind, track id and message from an error event', () => {
		expect(parseNativeAudioErrorEvent('error:unsupported:abc123:cannot decode wmav2')).toEqual({
			kind: 'unsupported',
			message: 'cannot decode wmav2',
			trackId: 'abc123',
		});
	});

	it('keeps colons inside the error message intact', () => {
		expect(parseNativeAudioErrorEvent('error:network:abc123:HTTP 404: not found')).toEqual({
			kind: 'network',
			message: 'HTTP 404: not found',
			trackId: 'abc123',
		});
	});

	it('returns a null track id when the error event carries no track', () => {
		expect(parseNativeAudioErrorEvent('error:unknown::something broke')).toEqual({
			kind: 'unknown',
			message: 'something broke',
			trackId: null,
		});
	});

	it('falls back to the unknown kind for an unrecognized kind token', () => {
		expect(parseNativeAudioErrorEvent('error:banana:abc123:odd')).toEqual({
			kind: 'unknown',
			message: 'odd',
			trackId: 'abc123',
		});
	});

	it('tolerates an error event with no message', () => {
		expect(parseNativeAudioErrorEvent('error:unsupported:abc123:')).toEqual({
			kind: 'unsupported',
			message: '',
			trackId: 'abc123',
		});
	});

	it('returns null for events that are not errors', () => {
		expect(parseNativeAudioErrorEvent('completed:abc123')).toBeNull();
		expect(parseNativeAudioErrorEvent('loaded')).toBeNull();
		expect(parseNativeAudioErrorEvent('')).toBeNull();
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
