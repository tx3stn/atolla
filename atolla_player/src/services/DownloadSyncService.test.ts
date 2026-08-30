import { describe, expect, it } from 'bun:test';
import type { Album } from 'atolla_core/src/models/Album';
import type { Playlist } from 'atolla_core/src/models/Playlist';
import type { Track } from 'atolla_core/src/models/Track';
import type { AddTracksToPlaylistParams, ArtworkRefresh } from './DownloadService';
import {
	DownloadSyncService,
	type DownloadSyncTarget,
	type DownloadSyncTransport,
} from './DownloadSyncService';

function makeTrack(id: string): Track {
	return { albumId: 'album-1', artistId: 'artist-1', duration: 180, id, name: `Track ${id}` };
}

function makePlaylist(id: string): Playlist {
	return { id, name: `Playlist ${id}` };
}

function makeAlbum(id: string): Album {
	return { artistId: 'artist-1', artistName: 'Artist', id, name: `Album ${id}` };
}

function page(items: Array<Track>, hasMore = false) {
	return Promise.resolve({ hasMore, items, totalCount: items.length });
}

function createTarget(config: {
	albumIds?: Array<string>;
	artistIds?: Array<string>;
	downloadingCount?: number;
	genreIds?: Array<string>;
	playlists?: Array<{ playlist: Playlist; trackIds: Array<string> }>;
}): {
	addPlaylistCalls: Array<AddTracksToPlaylistParams>;
	getAllPlaylistsCount: () => number;
	refreshCalls: Array<ArtworkRefresh>;
	target: DownloadSyncTarget;
} {
	const addPlaylistCalls: Array<AddTracksToPlaylistParams> = [];
	const refreshCalls: Array<ArtworkRefresh> = [];
	let getAllPlaylistsCalls = 0;

	const target: DownloadSyncTarget = {
		addTracksToPlaylist: (params) => addPlaylistCalls.push(params),
		getAllAlbums: () =>
			(config.albumIds ?? []).map((id) => ({
				album: { artistId: 'artist-1', artistName: 'Artist', id, name: `Album ${id}` },
			})),
		getAllArtists: () =>
			(config.artistIds ?? []).map((id) => ({ artist: { id, name: `A ${id}` } })),
		getAllGenres: () => (config.genreIds ?? []).map((id) => ({ genre: { id, name: `G ${id}` } })),
		getAllPlaylists: () => {
			getAllPlaylistsCalls += 1;
			return config.playlists ?? [];
		},
		getDownloadingCount: () => config.downloadingCount ?? 0,
		refreshArtwork: (refresh) => refreshCalls.push(refresh),
	};

	return {
		addPlaylistCalls,
		getAllPlaylistsCount: () => getAllPlaylistsCalls,
		refreshCalls,
		target,
	};
}

function baseTransport(overrides: Partial<DownloadSyncTransport> = {}): DownloadSyncTransport {
	return {
		getAlbumsByIds: () => Promise.resolve([]),
		getArtist: () => Promise.resolve(null),
		getArtistLogoUrl: () => Promise.resolve(null),
		getArtistsByIds: () => Promise.resolve([]),
		getGenre: () => Promise.resolve(null),
		getGenres: () => Promise.resolve({ hasMore: false, items: [] }),
		getPlaylist: () => Promise.resolve(null),
		getTrackCacheUrl: (id) => `http://s/${id}`,
		getTracksByPlaylist: () => page([]),
		...overrides,
	};
}

describe('DownloadSyncService', () => {
	it('downloads newly-added playlist tracks', async () => {
		const { addPlaylistCalls, target } = createTarget({
			playlists: [{ playlist: makePlaylist('p1'), trackIds: ['t1'] }],
		});
		const service = new DownloadSyncService({ downloadService: target });
		const transport = baseTransport({
			getTracksByPlaylist: (_id, p) =>
				p === 1 ? page([makeTrack('t1'), makeTrack('t2')]) : page([]),
		});

		await service.syncAll(transport);

		expect(addPlaylistCalls).toHaveLength(1);
		expect(addPlaylistCalls[0].playlist.id).toBe('p1');
		expect(addPlaylistCalls[0].tracks.map((t) => t.track.id)).toEqual(['t2']);
	});

	it('is a no-op when the playlist is unchanged', async () => {
		const { addPlaylistCalls, target } = createTarget({
			playlists: [{ playlist: makePlaylist('p1'), trackIds: ['t1'] }],
		});
		const service = new DownloadSyncService({ downloadService: target });
		const transport = baseTransport({ getTracksByPlaylist: () => page([makeTrack('t1')]) });

		await service.syncAll(transport);

		expect(addPlaylistCalls).toHaveLength(0);
	});

	it('leaves server-removed tracks alone (additive only)', async () => {
		const { addPlaylistCalls, target } = createTarget({
			playlists: [{ playlist: makePlaylist('p1'), trackIds: ['t1', 't2'] }],
		});
		const service = new DownloadSyncService({ downloadService: target });
		// server dropped t2; only t1 remains
		const transport = baseTransport({ getTracksByPlaylist: () => page([makeTrack('t1')]) });

		await service.syncAll(transport);

		expect(addPlaylistCalls).toHaveLength(0);
	});

	it('aggregates tracks across pages', async () => {
		const { addPlaylistCalls, target } = createTarget({
			playlists: [{ playlist: makePlaylist('p1'), trackIds: ['t1'] }],
		});
		const service = new DownloadSyncService({ downloadService: target });
		const transport = baseTransport({
			getTracksByPlaylist: (_id, p) => {
				if (p === 1) return page([makeTrack('t1')], true);
				if (p === 2) return page([makeTrack('t2')], false);
				return page([]);
			},
		});

		await service.syncAll(transport);

		expect(addPlaylistCalls[0].tracks.map((t) => t.track.id)).toEqual(['t2']);
	});

	it('coalesces concurrent passes into one (single-flight)', async () => {
		const { getAllPlaylistsCount, target } = createTarget({
			playlists: [{ playlist: makePlaylist('p1'), trackIds: ['t1'] }],
		});
		const service = new DownloadSyncService({ downloadService: target });
		const transport = baseTransport({ getTracksByPlaylist: () => page([makeTrack('t1')]) });

		const first = service.syncAll(transport);
		const second = service.syncAll(transport);
		await Promise.all([first, second]);

		expect(getAllPlaylistsCount()).toBe(1);
	});

	it('can run again after a previous pass completes', async () => {
		const { getAllPlaylistsCount, target } = createTarget({
			playlists: [{ playlist: makePlaylist('p1'), trackIds: ['t1'] }],
		});
		const service = new DownloadSyncService({ downloadService: target });
		const transport = baseTransport({ getTracksByPlaylist: () => page([makeTrack('t1')]) });

		await service.syncAll(transport);
		await service.syncAll(transport);

		expect(getAllPlaylistsCount()).toBe(2);
	});

	it('keeps syncing when one playlist fails', async () => {
		const { addPlaylistCalls, target } = createTarget({
			playlists: [
				{ playlist: makePlaylist('p1'), trackIds: ['t1'] },
				{ playlist: makePlaylist('p2'), trackIds: ['t1'] },
			],
		});
		const service = new DownloadSyncService({ downloadService: target });
		const transport = baseTransport({
			getTracksByPlaylist: (id) =>
				id === 'p1' ? Promise.reject(new Error('boom')) : page([makeTrack('t1'), makeTrack('t2')]),
		});

		await service.syncAll(transport);

		expect(addPlaylistCalls.map((c) => c.playlist.id)).toEqual(['p2']);
	});

	it('resolves without throwing when there is nothing downloaded', async () => {
		const { target } = createTarget({});
		const service = new DownloadSyncService({ downloadService: target });

		await expect(service.syncAll(baseTransport())).resolves.toBeUndefined();
	});

	describe('artwork refresh', () => {
		it('hands the current server artwork for every downloaded entity to the download service', async () => {
			const { refreshCalls, target } = createTarget({
				albumIds: ['album-1'],
				artistIds: ['artist-1'],
				genreIds: ['genre-1'],
				playlists: [{ playlist: makePlaylist('p1'), trackIds: [] }],
			});
			const service = new DownloadSyncService({ downloadService: target });
			const transport = baseTransport({
				getAlbumsByIds: (ids) =>
					Promise.resolve(
						ids.map((id) => ({ ...makeAlbum(id), imageUrl: `http://art/${id}?t=2` })),
					),
				getArtistsByIds: (ids) =>
					Promise.resolve(ids.map((id) => ({ id, logoUrl: `http://logo/${id}?t=2`, name: id }))),
				getGenre: (id) => Promise.resolve({ id, imageUrl: `http://genre/${id}?t=2`, name: id }),
				getPlaylist: (id) => Promise.resolve({ id, imageUrl: `http://pl/${id}?t=2`, name: id }),
			});

			await service.syncAll(transport);

			expect(refreshCalls).toHaveLength(1);
			const [refresh] = refreshCalls;
			expect(refresh.albums?.map((a) => a.imageUrl)).toEqual(['http://art/album-1?t=2']);
			expect(refresh.artists?.map((a) => a.logoUrl)).toEqual(['http://logo/artist-1?t=2']);
			expect(refresh.genres?.map((g) => g.imageUrl)).toEqual(['http://genre/genre-1?t=2']);
			expect(refresh.playlists?.map((p) => p.imageUrl)).toEqual(['http://pl/p1?t=2']);
		});

		it('asks for downloaded artists in one batched call, not one each', async () => {
			const { target } = createTarget({ artistIds: ['a1', 'a2', 'a3'] });
			const service = new DownloadSyncService({ downloadService: target });
			const batches: Array<Array<string>> = [];
			let perArtistCalls = 0;
			const transport = baseTransport({
				getArtist: (id) => {
					perArtistCalls += 1;
					return Promise.resolve({ id, name: id });
				},
				getArtistsByIds: (ids) => {
					batches.push(ids);
					return Promise.resolve(ids.map((id) => ({ id, name: id })));
				},
			});

			await service.syncAll(transport);

			expect(batches).toEqual([['a1', 'a2', 'a3']]);
			expect(perArtistCalls).toBe(0);
		});

		it('holds off while a download is still in flight', async () => {
			const { refreshCalls, target } = createTarget({
				albumIds: ['album-1'],
				artistIds: ['artist-1'],
				downloadingCount: 3,
			});
			const service = new DownloadSyncService({ downloadService: target });
			let albumFetches = 0;
			const transport = baseTransport({
				getAlbumsByIds: (ids) => {
					albumFetches += 1;
					return Promise.resolve(ids.map((id) => makeAlbum(id)));
				},
			});

			await service.syncAll(transport);

			expect(refreshCalls).toEqual([]);
			expect(albumFetches).toBe(0);
		});

		it('does not call the download service when nothing is downloaded', async () => {
			const { refreshCalls, target } = createTarget({});
			const service = new DownloadSyncService({ downloadService: target });

			await service.syncAll(baseTransport());

			expect(refreshCalls).toEqual([]);
		});

		it('still refreshes artwork when a playlist track sync fails', async () => {
			const { refreshCalls, target } = createTarget({
				albumIds: ['album-1'],
				playlists: [{ playlist: makePlaylist('p1'), trackIds: ['t1'] }],
			});
			const service = new DownloadSyncService({ downloadService: target });
			const transport = baseTransport({
				getAlbumsByIds: (ids) =>
					Promise.resolve(
						ids.map((id) => ({ ...makeAlbum(id), imageUrl: `http://art/${id}?t=2` })),
					),
				getTracksByPlaylist: () => Promise.reject(new Error('boom')),
			});

			await service.syncAll(transport);

			expect(refreshCalls).toHaveLength(1);
		});

		it('does not fail the sync when the artwork pass throws', async () => {
			const { target } = createTarget({ albumIds: ['album-1'] });
			const service = new DownloadSyncService({ downloadService: target });
			const transport = baseTransport({
				getAlbumsByIds: () => Promise.reject(new Error('boom')),
			});

			await expect(service.syncAll(transport)).resolves.toBeUndefined();
		});
	});
});
