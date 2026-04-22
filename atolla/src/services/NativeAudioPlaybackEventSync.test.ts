import { describe, expect, it } from 'bun:test';
import { PlaybackStore } from '../stores/Playback';
import {
	applyNativeAudioPlaybackEventAction,
	normalizeNativeAudioPlaybackEventAction,
} from './NativeAudioPlaybackEventSync';

describe('NativeAudioPlaybackEventSync', () => {
	it('normalizes pause interruption event', () => {
		expect(normalizeNativeAudioPlaybackEventAction(' pause-requested ')).toBe('pause');
		expect(normalizeNativeAudioPlaybackEventAction('completed')).toBe('');
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
