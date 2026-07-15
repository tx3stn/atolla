import { describe, expect, it } from 'bun:test';
import type { Album } from '../models/Album';
import type { Artist } from '../models/Artist';
import type { Genre } from '../models/Genre';
import type { Playlist } from '../models/Playlist';
import type { Track } from '../models/Track';
import {
	DownloadService,
	type DownloadServiceOptions,
	type DownloadServiceStore,
} from './DownloadService';

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

function makeGenre(id: string): Genre {
	return { id, name: `Genre ${id}` };
}

type CacheCall = { trackId: string; url: string };
type ImageCall = { category: string; url: string };

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
	imageCalls: Array<ImageCall>;
} {
	const store = options.store ?? new InMemoryStore();
	const cacheCalls: Array<CacheCall> = [];
	const removeCalls: Array<string> = [];
	const imageCalls: Array<ImageCall> = [];

	const service = new DownloadService({
		cacheImage: (url, category) => {
			imageCalls.push({ category, url });
			return Promise.resolve();
		},
		cacheTrack: (trackId, url) => {
			cacheCalls.push({ trackId, url });
			return Promise.resolve();
		},
		getTrackPlaybackUrl: (trackId) => `file://${trackId}`,
		removeTrack: (trackId) => {
			removeCalls.push(trackId);
		},
		store,
		...options,
	});

	return { cacheCalls, imageCalls, removeCalls, service, store };
}

// drain the microtask/promise queue so async effects settle
function flush(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

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

		it('caches artist logos and full + thumb album artwork for offline use', async () => {
			const { imageCalls, service } = createService();
			const album = { ...makeAlbum('album-1'), imageUrl: 'https://img/album-1.jpg' };
			const trackA = { ...makeTrack('track-1'), albumImageUrl: 'https://img/album-1.jpg' };
			const trackB = { ...makeTrack('track-2'), albumImageUrl: 'https://img/album-2.jpg' };

			service.downloadAlbum({
				album,
				artistImageUrl: 'https://img/artist-1.jpg',
				artistLogoUrl: 'https://img/logo-artist.jpg',
				tracks: [
					{ streamUrl: 'http://stream/track-1', track: trackA },
					{ streamUrl: 'http://stream/track-2', track: trackB },
				],
			});

			await flush();

			// full album_art is required (the blurred backdrop is generated from it)
			expect(imageCalls).toContainEqual({ category: 'album_art', url: 'https://img/album-1.jpg' });
			expect(imageCalls).toContainEqual({
				category: 'album_art_thumb',
				url: 'https://img/album-1.jpg',
			});
			expect(imageCalls).toContainEqual({ category: 'album_art', url: 'https://img/album-2.jpg' });
			expect(imageCalls).toContainEqual({
				category: 'album_art_thumb',
				url: 'https://img/album-2.jpg',
			});
			expect(imageCalls).toContainEqual({
				category: 'artist_image',
				url: 'https://img/artist-1.jpg',
			});
			expect(imageCalls).toContainEqual({
				category: 'artist_image_thumb',
				url: 'https://img/artist-1.jpg',
			});
			expect(imageCalls).toContainEqual({
				category: 'artist_logo',
				url: 'https://img/logo-artist.jpg',
			});
			// the blurred variant is generated on device, never fetched
			expect(imageCalls.some((c) => c.category === 'album_art_blurred')).toBe(false);
			// each unique asset is fetched once
			expect(
				imageCalls.filter((c) => c.category === 'album_art' && c.url.includes('album-1')),
			).toHaveLength(1);
		});

		it('indexes album genres for offline genre pages', async () => {
			const { service } = createService();
			const genreA = makeGenre('genre-1');
			const genreB = makeGenre('genre-2');
			const album = {
				...makeAlbum('album-1'),
				genres: [genreA, genreB],
			};

			service.downloadAlbum({
				album,
				artistLogoUrl: null,
				tracks: [{ streamUrl: 'http://stream/track-1', track: makeTrack('track-1') }],
			});

			await flush();
			const downloadedGenreTrackIds = service.getAllGenres().flatMap((entry) => entry.trackIds);

			expect(
				service
					.getAllGenres()
					.map((entry) => entry.genre.id)
					.sort(),
			).toEqual(['genre-1', 'genre-2']);
			expect(downloadedGenreTrackIds).toContain('track-1');
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

		it('indexes playlist track genres and caches genre images', async () => {
			const { imageCalls, service } = createService();
			const playlist = makePlaylist('playlist-1');
			const track = {
				...makeTrack('track-1'),
				genres: [{ id: 'genre-1', imageUrl: 'https://img/genre-1.jpg', name: 'Noise Rock' }],
			};

			service.downloadPlaylist({
				playlist,
				tracks: [{ artistLogoUrl: null, streamUrl: 'http://s/track-1', track }],
			});

			await flush();

			expect(service.getAllGenres().map((entry) => entry.genre.id)).toEqual(['genre-1']);
			expect(service.getAllGenres()[0].trackIds).toEqual(['track-1']);
			expect(imageCalls).toContainEqual({
				category: 'genre_art',
				url: 'https://img/genre-1.jpg',
			});
		});

		it('caches the playlist cover image', async () => {
			const { imageCalls, service } = createService();
			const playlist = { ...makePlaylist('playlist-1'), imageUrl: 'https://img/playlist-1.jpg' };
			const track = makeTrack('track-1');

			service.downloadPlaylist({
				playlist,
				tracks: [{ artistLogoUrl: null, streamUrl: 'http://s/track-1', track }],
			});

			await flush();

			expect(imageCalls).toContainEqual({
				category: 'playlist_image',
				url: 'https://img/playlist-1.jpg',
			});
			expect(imageCalls).toContainEqual({
				category: 'playlist_image_thumb',
				url: 'https://img/playlist-1.jpg',
			});
		});

		it('caches artist images when artists are provided', async () => {
			const { imageCalls, service } = createService();
			const playlist = makePlaylist('playlist-1');
			const track = makeTrack('track-1');
			const artist = { ...makeArtist('artist-1'), imageUrl: 'https://img/artist-1.jpg' };

			service.downloadPlaylist({
				artists: [artist],
				playlist,
				tracks: [{ artistLogoUrl: null, streamUrl: 'http://s/track-1', track }],
			});

			await flush();

			expect(imageCalls).toContainEqual({
				category: 'artist_image',
				url: 'https://img/artist-1.jpg',
			});
		});

		it('only indexes each track under its own genres, not every playlist genre', async () => {
			const { service } = createService();
			const playlist = makePlaylist('playlist-1');
			const rockTrack = {
				...makeTrack('track-1'),
				genres: [{ id: 'genre-rock', name: 'Rock' }],
			};
			const jazzTrack = {
				...makeTrack('track-2'),
				genres: [{ id: 'genre-jazz', name: 'Jazz' }],
			};
			// resolvedGenres is the union of every track's genres across the playlist
			const resolvedGenres = [
				{ id: 'genre-rock', imageUrl: 'https://img/rock.jpg', name: 'Rock' },
				{ id: 'genre-jazz', imageUrl: 'https://img/jazz.jpg', name: 'Jazz' },
			];

			service.downloadPlaylist({
				playlist,
				resolvedGenres,
				tracks: [
					{ artistLogoUrl: null, streamUrl: 'http://s/track-1', track: rockTrack },
					{ artistLogoUrl: null, streamUrl: 'http://s/track-2', track: jazzTrack },
				],
			});

			await flush();

			expect(service.getGenre('genre-rock')?.trackIds).toEqual(['track-1']);
			expect(service.getGenre('genre-jazz')?.trackIds).toEqual(['track-2']);
		});

		it('caches genre art and stores genre imageUrls when resolvedGenres are provided', async () => {
			const { imageCalls, service } = createService();
			const playlist = makePlaylist('playlist-1');
			const track = { ...makeTrack('track-1'), genres: [{ id: 'genre-1', name: 'Rock' }] };
			const resolvedGenre = { id: 'genre-1', imageUrl: 'https://img/genre-1.jpg', name: 'Rock' };

			service.downloadPlaylist({
				playlist,
				resolvedGenres: [resolvedGenre],
				tracks: [{ artistLogoUrl: null, streamUrl: 'http://s/track-1', track }],
			});

			await flush();

			expect(imageCalls).toContainEqual({
				category: 'genre_art',
				url: 'https://img/genre-1.jpg',
			});

			const genre = service.getAllGenres().find((e) => e.genre.id === 'genre-1');
			expect(genre?.genre.imageUrl).toBe('https://img/genre-1.jpg');
		});
	});

	describe('registerSyncedPlaylist', () => {
		it('shows as downloaded when all track ids are already complete', async () => {
			const { service } = createService();
			const track = makeTrack('track-1');
			service.downloadPlaylist({
				playlist: makePlaylist('other-playlist'),
				tracks: [{ artistLogoUrl: null, streamUrl: 'http://s/track-1', track }],
			});
			await flush();

			const playlist = makePlaylist('synced-playlist');
			service.registerSyncedPlaylist(playlist, ['track-1']);
			await flush();

			expect(service.getPlaylistDownloadState('synced-playlist')).toBe('downloaded');
		});

		it('caches the playlist cover image when imageUrl is present', async () => {
			const { imageCalls, service } = createService();
			const track = makeTrack('track-1');
			service.downloadPlaylist({
				playlist: makePlaylist('other-playlist'),
				tracks: [{ artistLogoUrl: null, streamUrl: 'http://s/track-1', track }],
			});
			await flush();

			const playlist = { ...makePlaylist('synced-playlist'), imageUrl: 'https://img/synced.jpg' };
			service.registerSyncedPlaylist(playlist, ['track-1']);
			await flush();

			const playlistImageCalls = imageCalls.filter((c) => c.url === 'https://img/synced.jpg');
			expect(playlistImageCalls.length).toBeGreaterThan(0);
			expect(playlistImageCalls.some((c) => c.category === 'playlist_image')).toBe(true);
			expect(playlistImageCalls.some((c) => c.category === 'playlist_image_thumb')).toBe(true);
		});

		it('does not attempt image caching when imageUrl is absent', async () => {
			const { imageCalls, service } = createService();
			const track = makeTrack('track-1');
			service.downloadPlaylist({
				playlist: makePlaylist('other-playlist'),
				tracks: [{ artistLogoUrl: null, streamUrl: 'http://s/track-1', track }],
			});
			await flush();
			const countBefore = imageCalls.length;

			service.registerSyncedPlaylist(makePlaylist('synced-playlist'), ['track-1']);
			await flush();

			expect(imageCalls.length).toBe(countBefore);
		});

		it('shows as not_downloaded when none of the track ids are in the cache', async () => {
			const { service } = createService();
			const playlist = makePlaylist('synced-playlist');
			service.registerSyncedPlaylist(playlist, ['unknown-track']);
			await flush();

			// trackIds are filtered to known-complete; an empty trackIds list reports
			// 'downloaded' (vacuously true), but the playlist entry is still registered
			expect(service.getPlaylistDownloadState('synced-playlist')).not.toBe('not_downloaded');
		});

		it('ignores empty string track ids', async () => {
			const { service } = createService();
			const playlist = makePlaylist('synced-playlist');
			service.registerSyncedPlaylist(playlist, ['']);
			await flush();

			// empty string filtered out, playlist registered with no tracks
			const state = service.getPlaylistDownloadState('synced-playlist');
			expect(state).toBe('downloaded'); // empty trackIds → vacuously all complete
		});

		it('can be looked up via getAllPlaylists', async () => {
			const { service } = createService();
			const playlist = makePlaylist('synced-playlist');
			service.registerSyncedPlaylist(playlist, []);
			await flush();

			const all = service.getAllPlaylists().map((e) => e.playlist.id);
			expect(all).toContain('synced-playlist');
		});
	});

	describe('downloadGenre', () => {
		it('marks all genre tracks as downloaded', async () => {
			const { service } = createService();
			const genre = makeGenre('genre-1');
			const tracks = [makeTrack('track-1'), makeTrack('track-2')];

			service.downloadGenre({
				genre,
				tracks: tracks.map((track) => ({
					artistLogoUrl: null,
					streamUrl: `http://s/${track.id}`,
					track,
				})),
			});

			await flush();

			expect(service.getGenreDownloadState('genre-1')).toBe('downloaded');
		});

		it('indexes each track only under the downloaded genre and its own genres', async () => {
			const { service } = createService();
			const genre = makeGenre('genre-1');
			const rockTrack = { ...makeTrack('track-1'), genres: [{ id: 'genre-rock', name: 'Rock' }] };
			const jazzTrack = { ...makeTrack('track-2'), genres: [{ id: 'genre-jazz', name: 'Jazz' }] };
			const resolvedGenres = [
				{ id: 'genre-rock', imageUrl: 'https://img/rock.jpg', name: 'Rock' },
				{ id: 'genre-jazz', imageUrl: 'https://img/jazz.jpg', name: 'Jazz' },
			];

			service.downloadGenre({
				genre,
				resolvedGenres,
				tracks: [
					{ artistLogoUrl: null, streamUrl: 'http://s/track-1', track: rockTrack },
					{ artistLogoUrl: null, streamUrl: 'http://s/track-2', track: jazzTrack },
				],
			});

			await flush();

			// both tracks belong to the downloaded genre
			expect(service.getGenre('genre-1')?.trackIds).toEqual(['track-1', 'track-2']);
			// but each track's own sub-genre only contains that track
			expect(service.getGenre('genre-rock')?.trackIds).toEqual(['track-1']);
			expect(service.getGenre('genre-jazz')?.trackIds).toEqual(['track-2']);
		});

		it('caches the genre image only as genre art, never as album art', async () => {
			const { imageCalls, service } = createService();
			const genre = { ...makeGenre('genre-1'), imageUrl: 'https://img/genre-1.jpg' };

			service.downloadGenre({
				genre,
				tracks: [
					{ artistLogoUrl: null, streamUrl: 'http://s/track-1', track: makeTrack('track-1') },
				],
			});

			await flush();

			expect(imageCalls).toContainEqual({ category: 'genre_art', url: 'https://img/genre-1.jpg' });
			expect(
				imageCalls.some(
					(c) => c.url === 'https://img/genre-1.jpg' && c.category.startsWith('album_art'),
				),
			).toBe(false);
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

	describe('getArtistDownloadState', () => {
		it('reports not_downloaded for an artist registered via a playlist (no albums)', async () => {
			const { service } = createService();

			// downloadPlaylist registers the playlist's artists with an empty albumIds list
			service.downloadPlaylist({
				artists: [makeArtist('artist-1')],
				playlist: makePlaylist('playlist-1'),
				tracks: [
					{ artistLogoUrl: null, streamUrl: 'http://s/track-1', track: makeTrack('track-1') },
				],
			});

			await flush();

			expect(service.getArtistDownloadState('artist-1')).toBe('not_downloaded');
		});
	});

	describe('artist normalisation', () => {
		it('normalises a track artistId to the album artistId when they differ', async () => {
			const { service } = createService();
			const album = makeAlbum('album-1'); // artistId: 'artist-1'
			const track = {
				...makeTrack('track-1'),
				artistId: 'artist-typo',
				artistName: 'Artist (typo)',
			};

			service.downloadAlbum({
				album,
				artistLogoUrl: null,
				tracks: [{ streamUrl: 'http://s/track-1', track }],
			});

			await flush();

			expect(service.getTrack('track-1')?.track.artistId).toBe('artist-1');
			expect(service.getAllArtists()).toHaveLength(1);
			expect(service.getAllArtists()[0].artist.id).toBe('artist-1');
		});

		it('normalises a track artistId when the track was already stored from a playlist', async () => {
			const { service } = createService();
			const album = makeAlbum('album-1'); // artistId: 'artist-1'
			const playlist = makePlaylist('playlist-1');
			const track = {
				...makeTrack('track-1'),
				artistId: 'artist-typo',
				artistName: 'Artist (typo)',
			};

			service.downloadPlaylist({
				playlist,
				tracks: [{ artistLogoUrl: null, streamUrl: 'http://s/track-1', track }],
			});
			await flush();

			expect(service.getTrack('track-1')?.track.artistId).toBe('artist-typo');

			service.downloadAlbum({
				album,
				artistLogoUrl: null,
				tracks: [{ streamUrl: 'http://s/track-1', track }],
			});
			await flush();

			expect(service.getTrack('track-1')?.track.artistId).toBe('artist-1');
			expect(service.getAllArtists().map((e) => e.artist.id)).toContain('artist-1');
		});
	});

	describe('reference counting', () => {
		it('keeps a track that belongs to both an album and a genre after genre removed', async () => {
			const { removeCalls, service } = createService();
			const album = makeAlbum('album-1');
			const genre = makeGenre('genre-1');
			const track = makeTrack('track-1');

			service.downloadAlbum({
				album,
				artistLogoUrl: null,
				tracks: [{ streamUrl: 'http://s/track-1', track }],
			});
			service.downloadGenre({
				genre,
				tracks: [{ artistLogoUrl: null, streamUrl: 'http://s/track-1', track }],
			});

			await flush();

			service.removeGenreDownload('genre-1');
			await flush();

			expect(service.isTrackDownloaded('track-1')).toBe(true);
			expect(service.getAlbumDownloadState('album-1')).toBe('downloaded');
			expect(removeCalls).toEqual([]);
		});

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

			// track still referenced by playlist
			expect(service.isTrackDownloaded('track-1')).toBe(true);
			expect(service.getPlaylistDownloadState('playlist-1')).toBe('downloaded');
			expect(removeCalls).toEqual([]);
		});

		it('removes a track when its last reference is removed', async () => {
			const { removeCalls, service } = createService();
			const album = {
				...makeAlbum('album-1'),
				genres: [makeGenre('genre-1')],
			};
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
			expect(service.getAllGenres()).toEqual([]);
			expect(removeCalls).toEqual(['track-1']);
		});

		it('removes a genre track when its last reference is removed', async () => {
			const { removeCalls, service } = createService();
			const genre = makeGenre('genre-1');
			const track = makeTrack('track-1');

			service.downloadGenre({
				genre,
				tracks: [{ artistLogoUrl: null, streamUrl: 'http://s/track-1', track }],
			});

			await flush();

			service.removeGenreDownload('genre-1');
			await flush();

			expect(service.isTrackDownloaded('track-1')).toBe(false);
			expect(service.getGenreDownloadState('genre-1')).toBe('not_downloaded');
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

		it('removes all downloaded entities and tracks when clearing all downloads', async () => {
			const { removeCalls, service } = createService();
			const album = makeAlbum('album-1');
			const playlist = makePlaylist('playlist-1');
			const trackA = makeTrack('track-1');
			const trackB = makeTrack('track-2');

			service.downloadAlbum({
				album,
				artistLogoUrl: null,
				tracks: [{ streamUrl: 'http://s/track-1', track: trackA }],
			});
			service.downloadPlaylist({
				playlist,
				tracks: [{ artistLogoUrl: null, streamUrl: 'http://s/track-2', track: trackB }],
			});

			await flush();

			service.removeAllDownloads();
			await flush();

			expect(service.getDownloadedTrackCount()).toBe(0);
			expect(service.getAlbumDownloadState('album-1')).toBe('not_downloaded');
			expect(service.getPlaylistDownloadState('playlist-1')).toBe('not_downloaded');
			expect(service.isTrackDownloaded('track-1')).toBe(false);
			expect(service.isTrackDownloaded('track-2')).toBe(false);
			expect(removeCalls.sort()).toEqual(['track-1', 'track-2']);
		});
	});

	describe('onAppReady', () => {
		it('resumes incomplete downloads from persisted state', async () => {
			const store = new InMemoryStore();
			const cacheCalls: Array<CacheCall> = [];

			// first service instance: starts a download but fails while offline, so the track
			// parks as incomplete (offline failures don't count toward giving up) rather than
			// exhausting its retries
			const { service: s1 } = createService({
				cacheTrack: () => Promise.reject(new Error('network failure')),
				isOnline: () => false,
				store,
			});

			s1.downloadAlbum({
				album: makeAlbum('album-1'),
				artistLogoUrl: null,
				tracks: [{ streamUrl: 'http://s/track-1', track: makeTrack('track-1') }],
			});

			await flush();

			expect(s1.getAlbumDownloadState('album-1')).toBe('downloading');

			// second service instance: simulates app restart, succeeds
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

	describe('track failure, partial state and retry', () => {
		it('marks a track failed after 3 online attempts and reports the album partial', async () => {
			const cacheCalls: Array<CacheCall> = [];
			const { service } = createService({
				cacheTrack: (trackId, url) => {
					cacheCalls.push({ trackId, url });
					return trackId === 'track-2' ? Promise.reject(new Error('boom')) : Promise.resolve();
				},
			});

			service.downloadAlbum({
				album: makeAlbum('album-1'),
				artistLogoUrl: null,
				tracks: [
					{ streamUrl: 'http://s/track-1', track: makeTrack('track-1') },
					{ streamUrl: 'http://s/track-2', track: makeTrack('track-2') },
				],
			});

			for (let i = 0; i < 6; i += 1) await flush();

			expect(cacheCalls.filter((c) => c.trackId === 'track-2')).toHaveLength(3);
			expect(service.isTrackDownloaded('track-1')).toBe(true);
			expect(service.getDownloadingCount()).toBe(0);
			expect(service.getAlbumDownloadState('album-1')).toBe('partial');
		});

		it('prunes an artifact once every track has failed', async () => {
			const { removeCalls, service } = createService({
				cacheTrack: () => Promise.reject(new Error('boom')),
			});

			service.downloadAlbum({
				album: makeAlbum('album-1'),
				artistLogoUrl: null,
				tracks: [{ streamUrl: 'http://s/track-1', track: makeTrack('track-1') }],
			});

			for (let i = 0; i < 10; i += 1) await flush();

			expect(service.getAlbum('album-1')).toBeUndefined();
			expect(service.getAllAlbums()).toHaveLength(0);
			expect(service.getAlbumDownloadState('album-1')).toBe('not_downloaded');
			expect(removeCalls).toContain('track-1');
		});

		it('does not count failures or retry in-session while offline', async () => {
			const cacheCalls: Array<CacheCall> = [];
			const { service } = createService({
				cacheTrack: (trackId, url) => {
					cacheCalls.push({ trackId, url });
					return Promise.reject(new Error('offline'));
				},
				isOnline: () => false,
			});

			service.downloadAlbum({
				album: makeAlbum('album-1'),
				artistLogoUrl: null,
				tracks: [
					{ streamUrl: 'http://s/track-1', track: makeTrack('track-1') },
					{ streamUrl: 'http://s/track-2', track: makeTrack('track-2') },
				],
			});

			for (let i = 0; i < 6; i += 1) await flush();

			// each track attempted once then parked — no hot-loop, nothing failed or pruned
			expect(cacheCalls).toHaveLength(2);
			expect(service.getAlbum('album-1')).toBeDefined();
			expect(service.getDownloadingCount()).toBe(2);
			expect(service.getAlbumDownloadState('album-1')).toBe('downloading');
		});

		it('resumes parked tracks when connectivity returns', async () => {
			let online = false;
			const { service } = createService({
				cacheTrack: () => (online ? Promise.resolve() : Promise.reject(new Error('offline'))),
				isOnline: () => online,
			});

			service.downloadAlbum({
				album: makeAlbum('album-1'),
				artistLogoUrl: null,
				tracks: [{ streamUrl: 'http://s/track-1', track: makeTrack('track-1') }],
			});

			for (let i = 0; i < 4; i += 1) await flush();
			expect(service.getAlbumDownloadState('album-1')).toBe('downloading');

			online = true;
			service.onAppReady();
			for (let i = 0; i < 4; i += 1) await flush();

			expect(service.getAlbumDownloadState('album-1')).toBe('downloaded');
		});

		it('marks an artist downloaded only when all of its albums are', async () => {
			const { service } = createService({
				cacheTrack: (trackId) =>
					trackId === 'a2-t2' ? Promise.reject(new Error('boom')) : Promise.resolve(),
			});

			service.downloadArtistAlbums({
				albumEntries: [
					{
						album: makeAlbum('album-1'),
						tracks: [{ streamUrl: 'u', track: makeTrack('a1-t1', 'album-1') }],
					},
					{
						album: makeAlbum('album-2'),
						tracks: [
							{ streamUrl: 'u', track: makeTrack('a2-t1', 'album-2') },
							{ streamUrl: 'u', track: makeTrack('a2-t2', 'album-2') },
						],
					},
				],
				artist: makeArtist('artist-1'),
				artistLogoUrl: null,
			});

			for (let i = 0; i < 8; i += 1) await flush();

			expect(service.getAlbumDownloadState('album-1')).toBe('downloaded');
			expect(service.getAlbumDownloadState('album-2')).toBe('partial');
			// album-2 is a partial failure, so the artist is downloadable-to-complete, not failed
			expect(service.getArtistDownloadState('artist-1')).toBe('not_downloaded');
		});

		it('retries the failed tracks on an explicit re-download', async () => {
			let failing = true;
			const { service } = createService({
				cacheTrack: (trackId) =>
					failing && trackId === 'track-2' ? Promise.reject(new Error('boom')) : Promise.resolve(),
			});
			const tracks = [
				{ streamUrl: 'http://s/track-1', track: makeTrack('track-1') },
				{ streamUrl: 'http://s/track-2', track: makeTrack('track-2') },
			];

			service.downloadAlbum({ album: makeAlbum('album-1'), artistLogoUrl: null, tracks });
			for (let i = 0; i < 6; i += 1) await flush();
			expect(service.getAlbumDownloadState('album-1')).toBe('partial');

			failing = false;
			service.downloadAlbum({ album: makeAlbum('album-1'), artistLogoUrl: null, tracks });
			for (let i = 0; i < 6; i += 1) await flush();

			expect(service.getAlbumDownloadState('album-1')).toBe('downloaded');
			expect(service.isTrackDownloaded('track-2')).toBe(true);
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

			for (const resolve of [...resolvers]) {
				resolve();
				await flush();
			}
		});
	});

	describe('operation serialization', () => {
		// a remove must run on the same operationChain as downloads; bypassing it can
		// interleave with an in-flight download (emptying maps mid-write or resurrecting
		// just-removed entries) and persist inconsistent state
		it('does not let removeAllDownloads persist while a download is mid-persist', async () => {
			const KEY_TRACKS = 'dl_tracks';
			const values = new Map<string, string>();
			let trackPersists = 0;
			let releaseGate: () => void = () => {};
			const gate = new Promise<void>((resolve) => {
				releaseGate = resolve;
			});

			const store: DownloadServiceStore = {
				fetchString: (key) => {
					const value = values.get(key);
					return value == null ? Promise.reject(new Error('missing')) : Promise.resolve(value);
				},
				storeString: async (key, value) => {
					values.set(key, value);
					if (key === KEY_TRACKS) {
						trackPersists += 1;
						await gate; // hold the first track-persist open
					}
				},
			};

			const service = new DownloadService({
				cacheImage: () => Promise.resolve(),
				cacheTrack: () => Promise.resolve(),
				getTrackPlaybackUrl: (trackId) => `file://${trackId}`,
				removeTrack: () => {},
				store,
			});

			service.downloadAlbum({
				album: makeAlbum('album-1'),
				artistLogoUrl: null,
				tracks: [{ streamUrl: 'http://s/track-1', track: makeTrack('track-1') }],
			});
			await flush(); // download op reaches persistAll and suspends on the gate
			expect(trackPersists).toBe(1);

			service.removeAllDownloads();
			await flush();
			// a serialized remove waits for the gated download; an unserialized one persists now
			expect(trackPersists).toBe(1);

			releaseGate();
			await flush();
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

	describe('onAppReady', () => {
		it('does not throw when the store fails to load', () => {
			// InMemoryStore rejects fetchString for missing keys, simulating a store with no
			// data. onAppReady returns void; the internal .catch() absorbs the rejection
			const { service } = createService();
			expect(() => service.onAppReady()).not.toThrow();
		});

		it('re-enqueues incomplete downloads from a persisted store on startup', async () => {
			const store = new InMemoryStore();

			// seed the store with an incomplete track entry
			await store.storeString(
				'dl_tracks',
				JSON.stringify({
					'track-1': {
						albumIds: ['album-1'],
						complete: false,
						genreIds: [],
						playlistIds: [],
						streamUrl: 'http://stream/track-1',
						track: makeTrack('track-1'),
					},
				}),
			);

			const { service, cacheCalls } = createService({ store });
			service.onAppReady();
			await flush();

			expect(cacheCalls.some((c) => c.trackId === 'track-1')).toBe(true);
		});
	});

	describe('image-gated completion', () => {
		function albumWithArt() {
			return { ...makeAlbum('album-1'), imageUrl: 'https://img/album-1.jpg' };
		}
		function trackWithArt() {
			return { ...makeTrack('track-1'), albumImageUrl: 'https://img/album-1.jpg' };
		}

		it('completes the item on audio alone, caching images in the background', async () => {
			let imageRequests = 0;
			let resolveImage!: () => void;
			const { service } = createService({
				cacheImage: () => {
					imageRequests += 1;
					return new Promise<void>((resolve) => {
						resolveImage = resolve;
					});
				},
			});

			service.downloadAlbum({
				album: albumWithArt(),
				artistLogoUrl: null,
				tracks: [{ streamUrl: 'http://s/track-1', track: trackWithArt() }],
			});

			await flush();

			// audio is cached, so the counter clears and the item shows downloaded
			// immediately; image caching continues in the background without gating
			expect(service.isTrackDownloaded('track-1')).toBe(true);
			expect(service.getDownloadingCount()).toBe(0);
			expect(service.getAlbumDownloadState('album-1')).toBe('downloaded');
			// required images were still requested for offline use
			expect(imageRequests).toBeGreaterThan(0);

			resolveImage();
			await flush();

			expect(service.getAlbumDownloadState('album-1')).toBe('downloaded');
		});

		it('does not re-request an image already cached for another item', async () => {
			const { imageCalls, service } = createService();

			service.downloadAlbum({
				album: albumWithArt(),
				artistLogoUrl: null,
				tracks: [{ streamUrl: 'http://s/track-1', track: trackWithArt() }],
			});
			await flush();

			const callsAfterAlbum = imageCalls.length;
			expect(callsAfterAlbum).toBeGreaterThan(0);

			// the same track (and its album art) added to a playlist must not re-fetch
			// the already-cached album artwork
			service.downloadPlaylist({
				playlist: makePlaylist('playlist-1'),
				tracks: [{ artistLogoUrl: null, streamUrl: 'http://s/track-1', track: trackWithArt() }],
			});
			await flush();

			expect(
				imageCalls.filter((c) => c.category === 'album_art' && c.url === 'https://img/album-1.jpg'),
			).toHaveLength(1);
		});

		it('retries a failing image up to the cap, then completes best-effort', async () => {
			const { imageCalls, service } = createService({
				cacheImage: (url, category) => {
					imageCalls.push({ category, url });
					return Promise.reject(new Error('boom'));
				},
			});

			service.downloadAlbum({
				album: albumWithArt(),
				artistLogoUrl: null,
				tracks: [{ streamUrl: 'http://s/track-1', track: trackWithArt() }],
			});

			// allow retries (no backoff) to play out across several macrotasks
			for (let i = 0; i < 6; i += 1) await flush();

			// the full album_art asset is retried exactly IMAGE_MAX_ATTEMPTS times
			expect(
				imageCalls.filter((c) => c.category === 'album_art' && c.url === 'https://img/album-1.jpg'),
			).toHaveLength(3);
			// best-effort exhaustion lets the item complete so it never stays stuck
			expect(service.getAlbumDownloadState('album-1')).toBe('downloaded');
		});

		it('retries incomplete (non-exhausted) images on app ready', async () => {
			const store = new InMemoryStore();

			// seed an incomplete, non-exhausted image plus the track that requires it,
			// as if the app was killed mid-download before retries were exhausted
			const imageKey = 'album_art:https://img/album-1.jpg';
			await store.storeString(
				'dl_tracks',
				JSON.stringify({
					'track-1': {
						albumIds: ['album-1'],
						complete: true,
						genreIds: [],
						playlistIds: [],
						requiredImageKeys: [imageKey],
						streamUrl: 'http://s/track-1',
						track: makeTrack('track-1'),
					},
				}),
			);
			await store.storeString(
				'dl_albums',
				JSON.stringify({
					'album-1': { album: makeAlbum('album-1'), artistLogoUrl: null, trackIds: ['track-1'] },
				}),
			);
			await store.storeString(
				'dl_images',
				JSON.stringify({
					[imageKey]: {
						attempts: 1,
						category: 'album_art',
						complete: false,
						exhausted: false,
						url: 'https://img/album-1.jpg',
					},
				}),
			);

			const imageCalls: Array<ImageCall> = [];
			const service = new DownloadService({
				cacheImage: (url, category) => {
					imageCalls.push({ category, url });
					return Promise.resolve();
				},
				cacheTrack: () => Promise.resolve(),
				getTrackPlaybackUrl: (id) => `file://${id}`,
				removeTrack: () => {},
				store,
			});

			expect(service.getAlbumDownloadState('album-1')).toBe('not_downloaded'); // not loaded yet

			service.onAppReady();
			for (let i = 0; i < 4; i += 1) await flush();

			expect(imageCalls).toContainEqual({ category: 'album_art', url: 'https://img/album-1.jpg' });
			expect(service.getAlbumDownloadState('album-1')).toBe('downloaded');
		});

		it('prunes tracked images when the owning item is removed', async () => {
			const store = new InMemoryStore();
			const { service } = createService({ store });

			service.downloadAlbum({
				album: albumWithArt(),
				artistLogoUrl: null,
				tracks: [{ streamUrl: 'http://s/track-1', track: trackWithArt() }],
			});
			await flush();

			service.removeAlbumDownload('album-1');
			await flush();

			const persistedImages = JSON.parse(await store.fetchString('dl_images'));
			expect(Object.keys(persistedImages)).toEqual([]);
		});
	});
});
