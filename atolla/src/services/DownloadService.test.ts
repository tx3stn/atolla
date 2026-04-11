import { describe, expect, it } from 'bun:test';
import type { Album } from '../models/Album';
import type { Artist } from '../models/Artist';
import type { Playlist } from '../models/Playlist';
import type { Track } from '../models/Track';
import {
	DownloadService,
	type DownloadServiceOptions,
	type DownloadServiceStore,
} from './DownloadService';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

class InMemoryStore implements DownloadServiceStore {
	private values = new Map<string, string>();

	fetchString(key: string): Promise<string> {
		const value = this.values.get(key);
		if (value == null) return Promise.reject(new Error('missing key'));
		return Promise.resolve(value);
	}

	storeString(key: string, value: string): Promise<void> {
		this.values.set(key, value);
		return Promise.resolve();
	}
}

function makeTrack(id: string, albumId = 'album-1'): Track {
	return { albumId, duration: 180, id, name: `Track ${id}` };
}

function makeAlbum(id: string): Album {
	return { artistId: 'artist-1', artistName: 'Artist', id, name: `Album ${id}` };
}

function makeArtist(id: string): Artist {
	return { id, name: `Artist ${id}` };
}

function makePlaylist(id: string): Playlist {
	return { id, name: `Playlist ${id}` };
}

type CacheCall = { trackId: string; url: string };

function createService(
	options: Partial<DownloadServiceOptions> & {
		store?: InMemoryStore;
		cacheTrack?: (trackId: string, url: string) => Promise<void>;
	} = {},
): {
	service: DownloadService;
	store: InMemoryStore;
	cacheCalls: Array<CacheCall>;
	removeCalls: Array<string>;
	preloadCalls: Array<{ category: string; urls: Array<string> }>;
} {
	const store = options.store ?? new InMemoryStore();
	const cacheCalls: Array<CacheCall> = [];
	const removeCalls: Array<string> = [];
	const preloadCalls: Array<{ category: string; urls: Array<string> }> = [];

	const service = new DownloadService({
		cacheTrack: (trackId, url) => {
			cacheCalls.push({ trackId, url });
			return Promise.resolve();
		},
		getTrackPlaybackUrl: (trackId) => `file://${trackId}`,
		preloadImages: (urls, category) => {
			preloadCalls.push({ category, urls });
		},
		removeTrack: (trackId) => {
			removeCalls.push(trackId);
		},
		store,
		...options,
	});

	return { cacheCalls, preloadCalls, removeCalls, service, store };
}

// Drain the microtask / Promise queue so async effects settle.
function flush(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DownloadService', () => {
	describe('downloadAlbum', () => {
		it('marks tracks as downloading then complete', async () => {
			const { service } = createService();
			const album = makeAlbum('album-1');
			const track = makeTrack('track-1');

			service.downloadAlbum({
				album,
				artistLogoUrl: null,
				tracks: [{ streamUrl: 'http://stream/track-1', track }],
			});

			await flush();

			expect(service.getAlbumDownloadState('album-1')).toBe('downloaded');
			expect(service.isTrackDownloaded('track-1')).toBe(true);
		});

		it('calls cacheTrack with the stream url', async () => {
			const { service, cacheCalls } = createService();
			const album = makeAlbum('album-1');
			const track = makeTrack('track-1');

			service.downloadAlbum({
				album,
				artistLogoUrl: null,
				tracks: [{ streamUrl: 'http://stream/track-1', track }],
			});

			await flush();

			expect(cacheCalls).toHaveLength(1);
			expect(cacheCalls[0]).toEqual({ trackId: 'track-1', url: 'http://stream/track-1' });
		});

		it('does not re-download already complete tracks', async () => {
			const { service, cacheCalls } = createService();
			const album = makeAlbum('album-1');
			const track = makeTrack('track-1');
			const trackEntry = { streamUrl: 'http://stream/track-1', track };

			service.downloadAlbum({ album, artistLogoUrl: null, tracks: [trackEntry] });
			await flush();

			const firstCount = cacheCalls.length;

			service.downloadAlbum({ album, artistLogoUrl: null, tracks: [trackEntry] });
			await flush();

			expect(cacheCalls.length).toBe(firstCount);
		});

		it('increments downloading count while in progress', async () => {
			let resolveCacheTrack!: () => void;
			const { service } = createService({
				cacheTrack: () =>
					new Promise<void>((resolve) => {
						resolveCacheTrack = resolve;
					}),
			});

			service.downloadAlbum({
				album: makeAlbum('album-1'),
				artistLogoUrl: null,
				tracks: [{ streamUrl: 'http://stream/track-1', track: makeTrack('track-1') }],
			});

			await flush();

			expect(service.getDownloadingCount()).toBe(1);
			expect(service.getAlbumDownloadState('album-1')).toBe('downloading');

			resolveCacheTrack();
			await flush();

			expect(service.getDownloadingCount()).toBe(0);
			expect(service.getAlbumDownloadState('album-1')).toBe('downloaded');
		});

		it('preloads artist logos and album artwork for offline image cache', async () => {
			const { preloadCalls, service } = createService();
			const album = { ...makeAlbum('album-1'), imageUrl: 'https://img/album-1.jpg' };
			const trackA = { ...makeTrack('track-1'), albumImageUrl: 'https://img/album-1.jpg' };
			const trackB = { ...makeTrack('track-2'), albumImageUrl: 'https://img/album-2.jpg' };

			service.downloadAlbum({
				album,
				artistLogoUrl: 'https://img/logo-artist.jpg',
				tracks: [
					{ streamUrl: 'http://stream/track-1', track: trackA },
					{ streamUrl: 'http://stream/track-2', track: trackB },
				],
			});

			await flush();

			expect(preloadCalls).toEqual([
				{
					category: 'album_art',
					urls: ['https://img/album-1.jpg', 'https://img/album-2.jpg'],
				},
				{ category: 'artist_logo', urls: ['https://img/logo-artist.jpg'] },
			]);
		});
	});

	describe('downloadPlaylist', () => {
		it('marks all playlist tracks as downloaded', async () => {
			const { service } = createService();
			const playlist = makePlaylist('playlist-1');
			const tracks = [makeTrack('track-1'), makeTrack('track-2')];

			service.downloadPlaylist({
				playlist,
				tracks: tracks.map((track) => ({
					artistLogoUrl: null,
					streamUrl: `http://s/${track.id}`,
					track,
				})),
			});

			await flush();

			expect(service.getPlaylistDownloadState('playlist-1')).toBe('downloaded');
		});
	});

	describe('downloadArtistAlbums', () => {
		it('marks artist as downloaded when all albums complete', async () => {
			const { service } = createService();
			const artist = makeArtist('artist-1');
			const album = makeAlbum('album-1');
			const track = makeTrack('track-1');

			service.downloadArtistAlbums({
				albumEntries: [{ album, tracks: [{ streamUrl: 'http://s/track-1', track }] }],
				artist,
				artistLogoUrl: null,
			});

			await flush();

			expect(service.getArtistDownloadState('artist-1')).toBe('downloaded');
		});
	});

	describe('reference counting', () => {
		it('keeps a track that belongs to both an album and a playlist after album removed', async () => {
			const { removeCalls, service } = createService();
			const album = makeAlbum('album-1');
			const playlist = makePlaylist('playlist-1');
			const track = makeTrack('track-1');

			service.downloadAlbum({
				album,
				artistLogoUrl: null,
				tracks: [{ streamUrl: 'http://s/track-1', track }],
			});
			service.downloadPlaylist({
				playlist,
				tracks: [{ artistLogoUrl: null, streamUrl: 'http://s/track-1', track }],
			});

			await flush();

			service.removeAlbumDownload('album-1');
			await flush();

			// Track still referenced by playlist
			expect(service.isTrackDownloaded('track-1')).toBe(true);
			expect(service.getPlaylistDownloadState('playlist-1')).toBe('downloaded');
			expect(removeCalls).toEqual([]);
		});

		it('removes a track when its last reference is removed', async () => {
			const { removeCalls, service } = createService();
			const album = makeAlbum('album-1');
			const track = makeTrack('track-1');

			service.downloadAlbum({
				album,
				artistLogoUrl: null,
				tracks: [{ streamUrl: 'http://s/track-1', track }],
			});

			await flush();

			service.removeAlbumDownload('album-1');
			await flush();

			expect(service.isTrackDownloaded('track-1')).toBe(false);
			expect(service.getAlbumDownloadState('album-1')).toBe('not_downloaded');
			expect(removeCalls).toEqual(['track-1']);
		});

		it('removes an artist and all its albums and tracks', async () => {
			const { service } = createService();
			const artist = makeArtist('artist-1');
			const album = makeAlbum('album-1');
			const track = makeTrack('track-1');

			service.downloadArtistAlbums({
				albumEntries: [{ album, tracks: [{ streamUrl: 'http://s/t1', track }] }],
				artist,
				artistLogoUrl: null,
			});

			await flush();

			service.removeArtistDownload('artist-1');
			await flush();

			expect(service.getArtistDownloadState('artist-1')).toBe('not_downloaded');
			expect(service.getAlbumDownloadState('album-1')).toBe('not_downloaded');
			expect(service.isTrackDownloaded('track-1')).toBe(false);
		});
	});

	describe('onAppReady', () => {
		it('resumes incomplete downloads from persisted state', async () => {
			const store = new InMemoryStore();
			const cacheCalls: Array<CacheCall> = [];

			// First service instance — starts a download but fails
			const { service: s1 } = createService({
				cacheTrack: () => Promise.reject(new Error('network failure')),
				store,
			});

			s1.downloadAlbum({
				album: makeAlbum('album-1'),
				artistLogoUrl: null,
				tracks: [{ streamUrl: 'http://s/track-1', track: makeTrack('track-1') }],
			});

			await flush();

			expect(s1.getAlbumDownloadState('album-1')).toBe('downloading');

			// Second service instance — simulates app restart, succeeds
			const s2 = new DownloadService({
				cacheTrack: (trackId, url) => {
					cacheCalls.push({ trackId, url });
					return Promise.resolve();
				},
				getTrackPlaybackUrl: (id) => `file://${id}`,
				removeTrack: () => {},
				store,
			});

			s2.onAppReady();
			await flush();

			expect(cacheCalls).toHaveLength(1);
			expect(cacheCalls[0].trackId).toBe('track-1');
			expect(s2.getAlbumDownloadState('album-1')).toBe('downloaded');
		});
	});

	describe('getTrackPlaybackUrl', () => {
		it('delegates to the injected getTrackPlaybackUrl function', () => {
			const { service } = createService({
				getTrackPlaybackUrl: (id) => `file:///data/${id}.mp3`,
			});

			expect(service.getTrackPlaybackUrl('track-1')).toBe('file:///data/track-1.mp3');
		});
	});

	describe('concurrent downloads', () => {
		it('limits concurrent downloads to 3', async () => {
			let activeCacheCount = 0;
			let maxActiveCacheCount = 0;
			const resolvers: Array<() => void> = [];

			const { service } = createService({
				cacheTrack: () =>
					new Promise<void>((resolve) => {
						activeCacheCount++;
						maxActiveCacheCount = Math.max(maxActiveCacheCount, activeCacheCount);
						resolvers.push(() => {
							activeCacheCount--;
							resolve();
						});
					}),
			});

			const album = makeAlbum('album-1');
			const tracks = Array.from({ length: 5 }, (_, i) => makeTrack(`track-${i + 1}`));

			service.downloadAlbum({
				album,
				artistLogoUrl: null,
				tracks: tracks.map((t) => ({ streamUrl: `http://s/${t.id}`, track: t })),
			});

			await flush();

			expect(maxActiveCacheCount).toBeLessThanOrEqual(3);

			// Drain the queue
			for (const resolve of [...resolvers]) {
				resolve();
				await flush();
			}
		});
	});

	describe('subscriptions', () => {
		it('notifies subscribers when download completes', async () => {
			const { service } = createService();
			let notifyCount = 0;

			service.subscribe(() => {
				notifyCount++;
			});

			service.downloadAlbum({
				album: makeAlbum('album-1'),
				artistLogoUrl: null,
				tracks: [{ streamUrl: 'http://s/track-1', track: makeTrack('track-1') }],
			});

			await flush();

			expect(notifyCount).toBeGreaterThan(0);
		});

		it('unsubscribe stops notifications', async () => {
			const { service } = createService();
			let notifyCount = 0;

			const unsubscribe = service.subscribe(() => {
				notifyCount++;
			});

			unsubscribe();

			service.downloadAlbum({
				album: makeAlbum('album-1'),
				artistLogoUrl: null,
				tracks: [{ streamUrl: 'http://s/track-1', track: makeTrack('track-1') }],
			});

			await flush();

			expect(notifyCount).toBe(0);
		});
	});
});
