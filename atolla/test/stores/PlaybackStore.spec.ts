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
		jasmine.clock().install();
		store = new PlaybackStore();
	});

	afterEach(() => {
		store.destroy();
		jasmine.clock().uninstall();
	});

	describe('progress timer', () => {
		it('advances progressSeconds by 1 each second while playing', () => {
			store.playTracks([makeTrack('a', 60)]);

			jasmine.clock().tick(3000);

			expect(store.progressSeconds).toBe(3);
		});

		it('does not advance when paused', () => {
			store.playTracks([makeTrack('a', 60)]);
			store.playPause();

			jasmine.clock().tick(3000);

			expect(store.progressSeconds).toBe(0);
		});

		it('resumes advancing after unpausing', () => {
			store.playTracks([makeTrack('a', 60)]);
			store.playPause(); // pause
			jasmine.clock().tick(2000);
			store.playPause(); // resume
			jasmine.clock().tick(3000);

			expect(store.progressSeconds).toBe(3);
		});

		it('resets progress when seekTo is called', () => {
			store.playTracks([makeTrack('a', 60)]);
			jasmine.clock().tick(5000);
			store.seekTo(10);

			jasmine.clock().tick(2000);

			expect(store.progressSeconds).toBe(12);
		});
	});

	describe('auto-advance', () => {
		it('advances to next track when current track ends', () => {
			store.playTracks([makeTrack('a', 3), makeTrack('b', 60)]);

			jasmine.clock().tick(3000);

			expect(store.trackIndex).toBe(1);
			expect(store.progressSeconds).toBe(0);
			expect(store.isPlaying).toBe(true);
		});

		it('stops playing when last track ends', () => {
			store.playTracks([makeTrack('a', 3)]);

			jasmine.clock().tick(3000);

			expect(store.isPlaying).toBe(false);
			expect(store.progressSeconds).toBe(3);
		});

		it('continues advancing through multiple tracks', () => {
			store.playTracks([makeTrack('a', 2), makeTrack('b', 2), makeTrack('c', 60)]);

			jasmine.clock().tick(4000);

			expect(store.trackIndex).toBe(2);
			expect(store.progressSeconds).toBe(0);
		});

		it('notifies listeners on each tick', () => {
			let count = 0;
			store.subscribe(() => {
				count += 1;
			});
			store.playTracks([makeTrack('a', 60)]);
			count = 0; // reset after play notification

			jasmine.clock().tick(3000);

			expect(count).toBe(3);
		});
	});

	describe('stop / destroy', () => {
		it('stops the timer when stop() is called', () => {
			store.playTracks([makeTrack('a', 60)]);
			store.stop();

			jasmine.clock().tick(5000);

			expect(store.progressSeconds).toBe(0);
		});

		it('stops the timer when destroy() is called', () => {
			store.playTracks([makeTrack('a', 60)]);
			store.destroy();

			jasmine.clock().tick(5000);

			// progress should stay at 0 (set by playTracks) and not advance
			expect(store.progressSeconds).toBe(0);
		});
	});
});
