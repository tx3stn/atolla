// @ts-nocheck
import 'jasmine/src/jasmine';
import type { Track } from 'atolla/src/models/Track';
import { PlaybackStore } from 'atolla/src/stores/Playback';

function makeTrack(id: string, duration: number): Track {
	return { duration, id, name: `Track ${id}` };
}

describe('PlaybackStore', () => {
	let store: PlaybackStore;

	beforeEach(() => {
		store = new PlaybackStore();
	});

	describe('seekTo()', () => {
		it('sets progressSeconds and seekTarget', () => {
			store.playTracks([makeTrack('a', 60)]);
			store.seekTo(30);

			expect(store.progressSeconds).toBe(30);
			expect(store.seekTarget).toBe(30);
		});

		it('clamps to track duration', () => {
			store.playTracks([makeTrack('a', 60)]);
			store.seekTo(999);

			expect(store.seekTarget).toBe(60);
		});

		it('does nothing with no active track', () => {
			store.seekTo(10);
			expect(store.seekTarget).toBeNull();
		});
	});

	describe('updateProgress()', () => {
		it('updates progressSeconds', () => {
			store.playTracks([makeTrack('a', 60)]);
			store.updateProgress(12);
			expect(store.progressSeconds).toBe(12);
		});

		it('notifies listeners', () => {
			let count = 0;
			store.subscribe(() => {
				count += 1;
			});
			store.playTracks([makeTrack('a', 60)]);
			count = 0;

			store.updateProgress(5);

			expect(count).toBe(1);
		});

		it('clears seekTarget', () => {
			store.playTracks([makeTrack('a', 60)]);
			store.seekTo(30);
			store.updateProgress(31);

			expect(store.seekTarget).toBeNull();
		});

		it('does nothing when there is no active track', () => {
			store.updateProgress(5);
			expect(store.progressSeconds).toBe(0);
		});

		it('advances to next track when progress reaches duration', () => {
			store.playTracks([makeTrack('a', 30), makeTrack('b', 60)]);
			store.updateProgress(30);

			expect(store.trackIndex).toBe(1);
			expect(store.progressSeconds).toBe(0);
			expect(store.isPlaying).toBe(true);
		});

		it('stops playing when last track reaches duration', () => {
			store.playTracks([makeTrack('a', 30)]);
			store.updateProgress(30);

			expect(store.isPlaying).toBe(false);
			expect(store.progressSeconds).toBe(30);
		});

		it('clamps progress to duration on last track', () => {
			store.playTracks([makeTrack('a', 30)]);
			store.updateProgress(999);

			expect(store.isPlaying).toBe(false);
			expect(store.progressSeconds).toBe(30);
		});
	});
});
