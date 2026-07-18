import { describe, expect, it } from 'bun:test';
import type { Playlist } from '../models/Playlist';
import type { Track } from '../models/Track';
import type { AddTracksToPlaylistParams } from './DownloadService';
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

function page(items: Array<Track>, hasMore = false) {
	return Promise.resolve({ hasMore, items, totalCount: items.length });
}

function createTarget(config: {
	playlists?: Array<{ playlist: Playlist; trackIds: Array<string> }>;
}): {
	addPlaylistCalls: Array<AddTracksToPlaylistParams>;
	getAllPlaylistsCount: () => number;
	target: DownloadSyncTarget;
} {
	const addPlaylistCalls: Array<AddTracksToPlaylistParams> = [];
	let getAllPlaylistsCalls = 0;

	const target: DownloadSyncTarget = {
		addTracksToPlaylist: (params) => addPlaylistCalls.push(params),
		getAllPlaylists: () => {
			getAllPlaylistsCalls += 1;
			return config.playlists ?? [];
		},
	};

	return {
		addPlaylistCalls,
		getAllPlaylistsCount: () => getAllPlaylistsCalls,
		target,
	};
}

function baseTransport(overrides: Partial<DownloadSyncTransport> = {}): DownloadSyncTransport {
	return {
		getArtist: () => Promise.resolve(null),
		getArtistLogoUrl: () => Promise.resolve(null),
		getGenres: () => Promise.resolve({ hasMore: false, items: [] }),
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
});
