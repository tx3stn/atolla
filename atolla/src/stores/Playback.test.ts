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

class InMemoryQueueStore {
	values = new Map<string, string>();
	writeCount = 0;

	fetchString(key: string): Promise<string> {
		const value = this.values.get(key);
		if (value == null) {
			return Promise.reject(new Error('missing key'));
		}
		return Promise.resolve(value);
	}

	storeString(key: string, value: string): Promise<void> {
		this.values.set(key, value);
		this.writeCount += 1;
		return Promise.resolve();
	}
}

describe('PlaybackStore', () => {
	describe('initial state', () => {
		it('starts with no track, album, or playback', () => {
			const store = new PlaybackStore();
			expect(store.track).toBeNull();
			expect(store.album).toBeNull();
			expect(store.isPlaying).toBe(false);
			expect(store.loopMode).toBe('none');
			expect(store.progressSeconds).toBe(0);
			expect(store.trackIndex).toBe(0);
			expect(store.tracks).toEqual([]);
			expect(store.artistLogoUrl).toBeNull();
		});
	});

	describe('cycleLoopMode()', () => {
		it('cycles from none to queue', () => {
			const store = new PlaybackStore();
			store.cycleLoopMode();
			expect(store.loopMode).toBe('queue');
		});

		it('cycles from queue to track', () => {
			const store = new PlaybackStore();
			store.loopMode = 'queue';
			store.cycleLoopMode();
			expect(store.loopMode as string).toBe('track');
		});

		it('cycles from track to none', () => {
			const store = new PlaybackStore();
			store.loopMode = 'track';
			store.cycleLoopMode();
			expect(store.loopMode as string).toBe('none');
		});

		it('notifies listeners', () => {
			const store = new PlaybackStore();
			let calls = 0;
			store.subscribe(() => calls++);
			store.cycleLoopMode();
			expect(calls).toBe(1);
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

	describe('updateProgress()', () => {
		it('loops the queue from start when mode is queue and final track completes', () => {
			const store = new PlaybackStore();
			store.play(tracks, album, 2);
			store.loopMode = 'queue';

			store.updateProgress(track3.duration);

			expect(store.trackIndex).toBe(0);
			expect(store.progressSeconds).toBe(0);
			expect(store.isPlaying).toBe(true);
			expect(store.seekTarget).toBe(0);
		});

		it('restarts current track when mode is track and track completes', () => {
			const store = new PlaybackStore();
			store.play(tracks, album, 1);
			store.loopMode = 'track';

			store.updateProgress(track2.duration);

			expect(store.trackIndex).toBe(1);
			expect(store.progressSeconds).toBe(0);
			expect(store.isPlaying).toBe(true);
			expect(store.seekTarget).toBe(0);
		});

		it('stops playback at final track when loop mode is none', () => {
			const store = new PlaybackStore();
			store.play(tracks, album, 2);

			store.updateProgress(track3.duration);

			expect(store.trackIndex).toBe(2);
			expect(store.progressSeconds).toBe(track3.duration);
			expect(store.isPlaying).toBe(false);
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
		it('sets the artist logo url for the current track', () => {
			const store = new PlaybackStore();
			store.play(tracks, album);
			store.setArtistLogoUrl('https://example.com/logo.png');
			expect(store.artistLogoUrl).toBe('https://example.com/logo.png');
		});

		it('accepts null', () => {
			const store = new PlaybackStore();
			store.play(tracks, album);
			store.setArtistLogoUrl('https://example.com/logo.png');
			store.setArtistLogoUrl(null);
			expect(store.artistLogoUrl).toBeNull();
		});

		it('does not leak a logo to play-next tracks from a different artist', () => {
			const store = new PlaybackStore();
			const openingTrack: Track = {
				artistId: 'artist-1',
				artistName: 'Artist One',
				duration: 120,
				id: 'track-opening',
				name: 'Opening Track',
			};
			const queuedTrack: Track = {
				artistId: 'artist-2',
				artistName: 'Artist Two',
				duration: 160,
				id: 'track-queued',
				name: 'Queued Track',
			};

			store.play([openingTrack], album);
			store.setArtistLogoUrl('https://example.com/artist-one-logo.png');
			store.playNext([queuedTrack]);

			store.updateProgress(openingTrack.duration);

			expect(store.track).toBe(queuedTrack);
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

	describe('removeFromQueueAt()', () => {
		it('removes the track at the provided index', () => {
			const store = new PlaybackStore();
			store.play(tracks, album, 0);

			store.removeFromQueueAt(2);

			expect(store.tracks).toEqual([track1, track2]);
			expect(store.trackIndex).toBe(0);
		});

		it('adjusts trackIndex when removing a track before current one', () => {
			const store = new PlaybackStore();
			store.play(tracks, album, 2);

			store.removeFromQueueAt(0);

			expect(store.trackIndex).toBe(1);
			expect(store.track).toBe(track3);
		});

		it('stops playback when removing the last remaining track', () => {
			const store = new PlaybackStore();
			store.play([track1], album, 0);

			store.removeFromQueueAt(0);

			expect(store.tracks).toEqual([]);
			expect(store.track).toBeNull();
			expect(store.isPlaying).toBe(false);
		});

		it('ignores out of bounds indices', () => {
			const store = new PlaybackStore();
			store.play(tracks, album, 1);

			store.removeFromQueueAt(-1);
			store.removeFromQueueAt(10);

			expect(store.tracks).toEqual(tracks);
			expect(store.trackIndex).toBe(1);
		});
	});

	describe('moveQueueTrack()', () => {
		it('moves a track from one index to another', () => {
			const store = new PlaybackStore();
			store.play(tracks, album, 0);

			store.moveQueueTrack(2, 1);

			expect(store.tracks).toEqual([track1, track3, track2]);
		});

		it('moves current track index with the track when current track is moved', () => {
			const store = new PlaybackStore();
			store.play(tracks, album, 1);

			store.moveQueueTrack(1, 2);

			expect(store.trackIndex).toBe(2);
			expect(store.track).toBe(track2);
		});

		it('adjusts current track index when another track crosses over it', () => {
			const store = new PlaybackStore();
			store.play(tracks, album, 1);

			store.moveQueueTrack(0, 2);

			expect(store.trackIndex).toBe(0);
			expect(store.track).toBe(track2);
		});

		it('ignores out of bounds and no-op moves', () => {
			const store = new PlaybackStore();
			store.play(tracks, album, 1);

			store.moveQueueTrack(-1, 0);
			store.moveQueueTrack(0, 99);
			store.moveQueueTrack(1, 1);

			expect(store.tracks).toEqual(tracks);
			expect(store.trackIndex).toBe(1);
		});

		it('notifies listeners', () => {
			const store = new PlaybackStore();
			store.play(tracks, album, 0);
			let calls = 0;
			store.subscribe(() => calls++);

			store.moveQueueTrack(2, 1);

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

	describe('setArtistLogoUrls()', () => {
		it('updates queued logo urls without resetting playback state', () => {
			const store = new PlaybackStore();
			store.playTracks(tracks, 1);
			store.updateProgress(37);

			store.setArtistLogoUrls(['logo1', 'logo2', 'logo3']);

			expect(store.trackIndex).toBe(1);
			expect(store.progressSeconds).toBe(37);
			expect(store.artistLogoUrl).toBe('logo2');
		});

		it('fills missing entries with null', () => {
			const store = new PlaybackStore();
			store.playTracks(tracks);

			store.setArtistLogoUrls(['logo1']);
			store.next();

			expect(store.artistLogoUrl).toBeNull();
		});

		it('notifies listeners', () => {
			const store = new PlaybackStore();
			store.playTracks(tracks);
			let calls = 0;
			store.subscribe(() => calls++);

			store.setArtistLogoUrls(['logo1', 'logo2', 'logo3']);

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

	describe('queue cache', () => {
		it('persists queue updates when a queue store is set', async () => {
			const queueStore = new InMemoryQueueStore();
			const store = new PlaybackStore();

			await store.setQueueStore(queueStore);
			store.playTracks([track1, track2], 1);

			const raw = queueStore.values.get('queue');
			expect(raw).toBeDefined();
			expect(raw).not.toBeNull();

			const payload = JSON.parse(raw ?? '{}') as {
				progressSeconds: number;
				trackIndex: number;
				tracks: Array<Track>;
			};
			expect(payload.progressSeconds).toBe(0);
			expect(payload.trackIndex).toBe(1);
			expect(payload.tracks).toEqual([track1, track2]);
		});

		it('restores queue state from cache', async () => {
			const queueStore = new InMemoryQueueStore();
			queueStore.values.set(
				'queue',
				JSON.stringify({
					album,
					artistLogoUrls: ['logo-1', null],
					progressSeconds: 33,
					trackIndex: 1,
					tracks: [track1, track2],
				}),
			);

			const store = new PlaybackStore();
			await store.setQueueStore(queueStore);

			expect(store.tracks).toEqual([track1, track2]);
			expect(store.trackIndex).toBe(1);
			expect(store.track).toEqual(track2);
			expect(store.artistLogoUrl).toBeNull();
			expect(store.progressSeconds).toBe(33);
			expect(store.isPlaying).toBe(false);
		});

		it('clamps restored progress to the active track duration', async () => {
			const queueStore = new InMemoryQueueStore();
			queueStore.values.set(
				'queue',
				JSON.stringify({
					album,
					artistLogoUrls: [null],
					progressSeconds: 999,
					trackIndex: 0,
					tracks: [track1],
				}),
			);

			const store = new PlaybackStore();
			await store.setQueueStore(queueStore);

			expect(store.progressSeconds).toBe(track1.duration);
		});

		it('supports restoring legacy queue payloads without progress', async () => {
			const queueStore = new InMemoryQueueStore();
			queueStore.values.set(
				'queue',
				JSON.stringify({
					album,
					artistLogoUrls: ['logo-1', null],
					trackIndex: 1,
					tracks: [track1, track2],
				}),
			);

			const store = new PlaybackStore();
			await store.setQueueStore(queueStore);

			expect(store.track).toEqual(track2);
			expect(store.progressSeconds).toBe(0);
		});

		it('checkpoints progress every five seconds while playing', async () => {
			const queueStore = new InMemoryQueueStore();
			const store = new PlaybackStore();

			await store.setQueueStore(queueStore);
			store.playTracks([track1]);
			const writesAfterPlay = queueStore.writeCount;

			store.updateProgress(1);
			store.updateProgress(3);
			store.updateProgress(4.9);
			expect(queueStore.writeCount).toBe(writesAfterPlay);

			store.updateProgress(5);
			expect(queueStore.writeCount).toBe(writesAfterPlay + 1);

			store.updateProgress(9);
			expect(queueStore.writeCount).toBe(writesAfterPlay + 1);

			store.updateProgress(10);
			expect(queueStore.writeCount).toBe(writesAfterPlay + 2);
		});

		it('persists progress immediately on seek and pause', async () => {
			const queueStore = new InMemoryQueueStore();
			const store = new PlaybackStore();

			await store.setQueueStore(queueStore);
			store.playTracks([track1]);
			const writesAfterPlay = queueStore.writeCount;

			store.seekTo(12);
			expect(queueStore.writeCount).toBe(writesAfterPlay + 1);

			store.playPause();
			expect(queueStore.writeCount).toBe(writesAfterPlay + 2);
		});

		it('ignores invalid cached payloads', async () => {
			const queueStore = new InMemoryQueueStore();
			queueStore.values.set('queue', JSON.stringify({ trackIndex: 0, tracks: 'invalid' }));

			const store = new PlaybackStore();
			await store.setQueueStore(queueStore);

			expect(store.tracks).toEqual([]);
			expect(store.track).toBeNull();
			expect(store.trackIndex).toBe(0);
		});
	});
});
