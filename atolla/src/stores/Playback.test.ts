import { describe, expect, it } from 'bun:test';
import type { Album } from '../models/Album';
import type { Track } from '../models/Track';
import { PlaybackStore, shuffleArray } from './Playback';

const album: Album = {
	artistId: 'artist-1',
	artistName: 'Test Artist',
	id: 'album-1',
	name: 'Test Album',
};

const track1: Track = { duration: 180, id: 'track-1', name: 'Track One' };
const track2: Track = { duration: 240, id: 'track-2', name: 'Track Two' };
const track3: Track = { duration: 300, id: 'track-3', name: 'Track Three' };
const tracks = [track1, track2, track3];

describe('PlaybackStore', () => {
	describe('initial state', () => {
		it('starts with no track, album, or playback', () => {
			const store = new PlaybackStore();
			expect(store.track).toBeNull();
			expect(store.album).toBeNull();
			expect(store.isPlaying).toBe(false);
			expect(store.progressSeconds).toBe(0);
			expect(store.trackIndex).toBe(0);
			expect(store.tracks).toEqual([]);
			expect(store.artistLogoUrl).toBeNull();
		});
	});

	describe('play()', () => {
		it('sets tracks, album, and starts playing from index 0 by default', () => {
			const store = new PlaybackStore();
			store.play(tracks, album);
			expect(store.tracks).toBe(tracks);
			expect(store.album).toBe(album);
			expect(store.track).toBe(track1);
			expect(store.trackIndex).toBe(0);
			expect(store.isPlaying).toBe(true);
			expect(store.progressSeconds).toBe(0);
		});

		it('starts from a given index', () => {
			const store = new PlaybackStore();
			store.play(tracks, album, 2);
			expect(store.trackIndex).toBe(2);
			expect(store.track).toBe(track3);
		});

		it('resets artistLogoUrl', () => {
			const store = new PlaybackStore();
			store.setArtistLogoUrl('https://example.com/logo.png');
			store.play(tracks, album);
			expect(store.artistLogoUrl).toBeNull();
		});

		it('resets progress when called again', () => {
			const store = new PlaybackStore();
			store.play(tracks, album);
			store.next();
			store.play(tracks, album, 1);
			expect(store.progressSeconds).toBe(0);
		});

		it('notifies listeners', () => {
			const store = new PlaybackStore();
			let calls = 0;
			store.subscribe(() => calls++);
			store.play(tracks, album);
			expect(calls).toBe(1);
		});
	});

	describe('next()', () => {
		it('advances to the next track', () => {
			const store = new PlaybackStore();
			store.play(tracks, album);
			store.next();
			expect(store.trackIndex).toBe(1);
			expect(store.track).toBe(track2);
		});

		it('resets progress', () => {
			const store = new PlaybackStore();
			store.play(tracks, album);
			store.next();
			expect(store.progressSeconds).toBe(0);
		});

		it('clamps at the last track', () => {
			const store = new PlaybackStore();
			store.play(tracks, album, 2);
			store.next();
			expect(store.trackIndex).toBe(2);
			expect(store.track).toBe(track3);
		});

		it('notifies listeners', () => {
			const store = new PlaybackStore();
			store.play(tracks, album);
			let calls = 0;
			store.subscribe(() => calls++);
			store.next();
			expect(calls).toBe(1);
		});
	});

	describe('previous()', () => {
		it('goes back to the previous track', () => {
			const store = new PlaybackStore();
			store.play(tracks, album, 1);
			store.previous();
			expect(store.trackIndex).toBe(0);
			expect(store.track).toBe(track1);
		});

		it('resets progress', () => {
			const store = new PlaybackStore();
			store.play(tracks, album, 1);
			store.previous();
			expect(store.progressSeconds).toBe(0);
		});

		it('clamps at the first track', () => {
			const store = new PlaybackStore();
			store.play(tracks, album, 0);
			store.previous();
			expect(store.trackIndex).toBe(0);
			expect(store.track).toBe(track1);
		});

		it('notifies listeners', () => {
			const store = new PlaybackStore();
			store.play(tracks, album, 1);
			let calls = 0;
			store.subscribe(() => calls++);
			store.previous();
			expect(calls).toBe(1);
		});
	});

	describe('playPause()', () => {
		it('toggles isPlaying from true to false', () => {
			const store = new PlaybackStore();
			store.play(tracks, album);
			store.playPause();
			expect(store.isPlaying).toBe(false);
		});

		it('toggles isPlaying from false to true', () => {
			const store = new PlaybackStore();
			store.play(tracks, album);
			store.playPause();
			store.playPause();
			expect(store.isPlaying).toBe(true);
		});

		it('notifies listeners', () => {
			const store = new PlaybackStore();
			store.play(tracks, album);
			let calls = 0;
			store.subscribe(() => calls++);
			store.playPause();
			expect(calls).toBe(1);
		});
	});

	describe('seekTo()', () => {
		it('sets progress to requested second within track duration', () => {
			const store = new PlaybackStore();
			store.play(tracks, album);
			store.seekTo(42);
			expect(store.progressSeconds).toBe(42);
		});

		it('clamps progress to track duration', () => {
			const store = new PlaybackStore();
			store.play(tracks, album);
			store.seekTo(999);
			expect(store.progressSeconds).toBe(track1.duration);
		});

		it('clamps progress to zero for negative values', () => {
			const store = new PlaybackStore();
			store.play(tracks, album);
			store.seekTo(-10);
			expect(store.progressSeconds).toBe(0);
		});
	});

	describe('skipForward()', () => {
		it('moves progress forward by 10 seconds by default', () => {
			const store = new PlaybackStore();
			store.play(tracks, album);
			store.seekTo(20);
			store.skipForward();
			expect(store.progressSeconds).toBe(30);
		});

		it('clamps to track duration', () => {
			const store = new PlaybackStore();
			store.play(tracks, album);
			store.seekTo(track1.duration - 1);
			store.skipForward(10);
			expect(store.progressSeconds).toBe(track1.duration);
		});
	});

	describe('stop()', () => {
		it('clears all playback state', () => {
			const store = new PlaybackStore();
			store.play(tracks, album);
			store.setArtistLogoUrl('https://example.com/logo.png');
			store.stop();
			expect(store.track).toBeNull();
			expect(store.album).toBeNull();
			expect(store.tracks).toEqual([]);
			expect(store.isPlaying).toBe(false);
			expect(store.progressSeconds).toBe(0);
			expect(store.trackIndex).toBe(0);
			expect(store.artistLogoUrl).toBeNull();
		});

		it('notifies listeners', () => {
			const store = new PlaybackStore();
			store.play(tracks, album);
			let calls = 0;
			store.subscribe(() => calls++);
			store.stop();
			expect(calls).toBe(1);
		});
	});

	describe('setArtistLogoUrl()', () => {
		it('sets the artist logo url', () => {
			const store = new PlaybackStore();
			store.setArtistLogoUrl('https://example.com/logo.png');
			expect(store.artistLogoUrl).toBe('https://example.com/logo.png');
		});

		it('accepts null', () => {
			const store = new PlaybackStore();
			store.setArtistLogoUrl('https://example.com/logo.png');
			store.setArtistLogoUrl(null);
			expect(store.artistLogoUrl).toBeNull();
		});

		it('notifies listeners', () => {
			const store = new PlaybackStore();
			let calls = 0;
			store.subscribe(() => calls++);
			store.setArtistLogoUrl('https://example.com/logo.png');
			expect(calls).toBe(1);
		});
	});

	describe('subscribe()', () => {
		it('calls the listener on each state change', () => {
			const store = new PlaybackStore();
			let calls = 0;
			store.subscribe(() => calls++);
			store.play(tracks, album);
			store.next();
			store.playPause();
			expect(calls).toBe(3);
		});

		it('returns an unsubscribe function that stops notifications', () => {
			const store = new PlaybackStore();
			let calls = 0;
			const unsubscribe = store.subscribe(() => calls++);
			store.play(tracks, album);
			unsubscribe();
			store.next();
			store.playPause();
			expect(calls).toBe(1);
		});

		it('supports multiple independent listeners', () => {
			const store = new PlaybackStore();
			let callsA = 0;
			let callsB = 0;
			const unsubA = store.subscribe(() => callsA++);
			store.subscribe(() => callsB++);
			store.play(tracks, album);
			unsubA();
			store.next();
			expect(callsA).toBe(1);
			expect(callsB).toBe(2);
		});
	});

	describe('track getter', () => {
		it('returns null when tracks is empty', () => {
			const store = new PlaybackStore();
			expect(store.track).toBeNull();
		});

		it('returns the track at trackIndex', () => {
			const store = new PlaybackStore();
			store.play(tracks, album, 1);
			expect(store.track).toBe(track2);
		});
	});

	describe('playTracks()', () => {
		it('sets tracks and starts playing from index 0 by default', () => {
			const store = new PlaybackStore();
			store.playTracks(tracks);
			expect(store.tracks).toBe(tracks);
			expect(store.trackIndex).toBe(0);
			expect(store.track).toBe(track1);
			expect(store.isPlaying).toBe(true);
			expect(store.progressSeconds).toBe(0);
		});

		it('sets album to null', () => {
			const store = new PlaybackStore();
			store.play(tracks, album);
			store.playTracks(tracks);
			expect(store.album).toBeNull();
		});

		it('starts from a given index', () => {
			const store = new PlaybackStore();
			store.playTracks(tracks, 2);
			expect(store.trackIndex).toBe(2);
			expect(store.track).toBe(track3);
		});

		it('resets artistLogoUrl', () => {
			const store = new PlaybackStore();
			store.setArtistLogoUrl('https://example.com/logo.png');
			store.playTracks(tracks);
			expect(store.artistLogoUrl).toBeNull();
		});

		it('notifies listeners', () => {
			const store = new PlaybackStore();
			let calls = 0;
			store.subscribe(() => calls++);
			store.playTracks(tracks);
			expect(calls).toBe(1);
		});
	});

	describe('addToQueue()', () => {
		it('appends tracks to the end of the queue', () => {
			const store = new PlaybackStore();
			store.play(tracks, album);
			const extra: Track = { duration: 120, id: 'track-4', name: 'Track Four' };
			store.addToQueue([extra]);
			expect(store.tracks).toEqual([...tracks, extra]);
		});

		it('does not change the current track index', () => {
			const store = new PlaybackStore();
			store.play(tracks, album, 1);
			const extra: Track = { duration: 120, id: 'track-4', name: 'Track Four' };
			store.addToQueue([extra]);
			expect(store.trackIndex).toBe(1);
			expect(store.track).toBe(track2);
		});

		it('does not change isPlaying', () => {
			const store = new PlaybackStore();
			store.play(tracks, album);
			store.playPause();
			store.addToQueue([track1]);
			expect(store.isPlaying).toBe(false);
		});

		it('can append multiple tracks at once', () => {
			const store = new PlaybackStore();
			store.play([track1], album);
			store.addToQueue([track2, track3]);
			expect(store.tracks).toEqual([track1, track2, track3]);
		});

		it('notifies listeners', () => {
			const store = new PlaybackStore();
			store.play(tracks, album);
			let calls = 0;
			store.subscribe(() => calls++);
			store.addToQueue([track1]);
			expect(calls).toBe(1);
		});
	});

	describe('playNext()', () => {
		it('inserts tracks immediately after the current track', () => {
			const store = new PlaybackStore();
			store.play(tracks, album, 0);
			const extra: Track = { duration: 120, id: 'track-4', name: 'Track Four' };
			store.playNext([extra]);
			expect(store.tracks).toEqual([track1, extra, track2, track3]);
		});

		it('does not change the current track index', () => {
			const store = new PlaybackStore();
			store.play(tracks, album, 1);
			store.playNext([track1]);
			expect(store.trackIndex).toBe(1);
			expect(store.track).toBe(track2);
		});

		it('inserts multiple tracks in order after current', () => {
			const store = new PlaybackStore();
			const extra1: Track = { duration: 120, id: 'track-4', name: 'Track Four' };
			const extra2: Track = { duration: 120, id: 'track-5', name: 'Track Five' };
			store.play([track1, track3], album, 0);
			store.playNext([extra1, extra2]);
			expect(store.tracks).toEqual([track1, extra1, extra2, track3]);
		});

		it('inserts at end when on the last track', () => {
			const store = new PlaybackStore();
			store.play(tracks, album, 2);
			const extra: Track = { duration: 120, id: 'track-4', name: 'Track Four' };
			store.playNext([extra]);
			expect(store.tracks).toEqual([...tracks, extra]);
		});

		it('notifies listeners', () => {
			const store = new PlaybackStore();
			store.play(tracks, album);
			let calls = 0;
			store.subscribe(() => calls++);
			store.playNext([track1]);
			expect(calls).toBe(1);
		});
	});

	describe('playWithArtistLogos()', () => {
		it('sets tracks and starts playing from index 0 by default', () => {
			const store = new PlaybackStore();
			const logoUrls = ['logo1', 'logo2', null];
			store.playWithArtistLogos(tracks, logoUrls);
			expect(store.tracks).toBe(tracks);
			expect(store.trackIndex).toBe(0);
			expect(store.track).toBe(track1);
			expect(store.isPlaying).toBe(true);
			expect(store.progressSeconds).toBe(0);
		});

		it('sets album to null', () => {
			const store = new PlaybackStore();
			store.play(tracks, album);
			store.playWithArtistLogos(tracks, []);
			expect(store.album).toBeNull();
		});

		it('returns the logo url for the current track', () => {
			const store = new PlaybackStore();
			store.playWithArtistLogos(tracks, ['logo1', 'logo2', 'logo3']);
			expect(store.artistLogoUrl).toBe('logo1');
		});

		it('returns the correct logo url as track index advances', () => {
			const store = new PlaybackStore();
			store.playWithArtistLogos(tracks, ['logo1', 'logo2', 'logo3']);
			store.next();
			expect(store.artistLogoUrl).toBe('logo2');
			store.next();
			expect(store.artistLogoUrl).toBe('logo3');
		});

		it('returns null for tracks with no logo url', () => {
			const store = new PlaybackStore();
			store.playWithArtistLogos(tracks, [null, 'logo2', null]);
			expect(store.artistLogoUrl).toBeNull();
			store.next();
			expect(store.artistLogoUrl).toBe('logo2');
		});

		it('notifies listeners', () => {
			const store = new PlaybackStore();
			let calls = 0;
			store.subscribe(() => calls++);
			store.playWithArtistLogos(tracks, []);
			expect(calls).toBe(1);
		});
	});

	describe('shuffleArray()', () => {
		it('returns a new array with the same elements', () => {
			const arr = [1, 2, 3, 4, 5];
			const result = shuffleArray(arr);
			expect(result).toHaveLength(arr.length);
			expect(result).toEqual(expect.arrayContaining(arr));
		});

		it('does not mutate the original array', () => {
			const arr = [1, 2, 3, 4, 5];
			const copy = [...arr];
			shuffleArray(arr);
			expect(arr).toEqual(copy);
		});

		it('returns a new array reference', () => {
			const arr = [1, 2, 3];
			expect(shuffleArray(arr)).not.toBe(arr);
		});
	});

	describe('shuffle()', () => {
		it('shuffles tracks after the current index', () => {
			const store = new PlaybackStore();
			store.play(tracks, album, 0);
			store.shuffle();
			expect(store.tracks[0]).toBe(track1);
			expect(store.tracks).toHaveLength(3);
			expect(store.tracks).toEqual(expect.arrayContaining([track1, track2, track3]));
		});

		it('keeps the current track at the current index', () => {
			const store = new PlaybackStore();
			store.play(tracks, album, 1);
			store.shuffle();
			expect(store.track).toBe(track2);
			expect(store.trackIndex).toBe(1);
		});

		it('does not change isPlaying', () => {
			const store = new PlaybackStore();
			store.play(tracks, album);
			store.shuffle();
			expect(store.isPlaying).toBe(true);
		});

		it('is a no-op when there are no tracks after the current', () => {
			const store = new PlaybackStore();
			store.play(tracks, album, 2);
			store.shuffle();
			expect(store.tracks).toEqual(tracks);
		});

		it('is a no-op when the queue is empty', () => {
			const store = new PlaybackStore();
			store.shuffle();
			expect(store.tracks).toEqual([]);
		});

		it('notifies listeners', () => {
			const store = new PlaybackStore();
			store.play(tracks, album);
			let calls = 0;
			store.subscribe(() => calls++);
			store.shuffle();
			expect(calls).toBe(1);
		});
	});
});
