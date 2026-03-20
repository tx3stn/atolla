import { describe, expect, it } from 'bun:test';
import type { Album } from '../models/Album';
import type { Track } from '../models/Track';
import { PlaybackStore } from './Playback';

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
});
