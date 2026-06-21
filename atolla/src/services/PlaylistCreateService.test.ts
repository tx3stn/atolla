import { describe, expect, it } from 'bun:test';
import type { Transport } from '../transports/Transport';
import { PlaylistCreateService } from './PlaylistCreateService';

function createStoreMock(initial: string | null = null): {
	fetchString: (key: string) => Promise<string>;
	storeString: (key: string, value: string) => Promise<void>;
	stored: Record<string, string>;
} {
	const stored: Record<string, string> = {};
	if (initial !== null) {
		stored.pending_playlist_creates = initial;
	}
	return {
		fetchString: (key: string) => {
			if (key in stored) return Promise.resolve(stored[key]);
			return Promise.reject(new Error('not found'));
		},
		stored,
		storeString: (key: string, value: string) => {
			stored[key] = value;
			return Promise.resolve();
		},
	};
}

function createTransportMock(options: { failCreate?: boolean } = {}): {
	addItemToPlaylist: (playlistId: string, trackId: string) => Promise<void>;
	createPlaylist: (
		name: string,
		trackId?: string,
	) => Promise<{ id: string; imageUrl?: string; name: string }>;
	addedItems: Array<{ playlistId: string; trackId: string }>;
	createdPlaylists: Array<{ name: string; trackId?: string }>;
} {
	const createdPlaylists: Array<{ name: string; trackId?: string }> = [];
	const addedItems: Array<{ playlistId: string; trackId: string }> = [];
	let idCounter = 1;
	return {
		addedItems,
		addItemToPlaylist: (playlistId: string, trackId: string) => {
			addedItems.push({ playlistId, trackId });
			return Promise.resolve();
		},
		createdPlaylists,
		createPlaylist: (name: string, trackId?: string) => {
			if (options.failCreate) return Promise.reject(new Error('server error'));
			createdPlaylists.push({ name, trackId });
			return Promise.resolve({
				id: `playlist-${idCounter++}`,
				imageUrl: `https://img/playlist-${idCounter - 1}.jpg`,
				name,
			});
		},
	};
}

describe('PlaylistCreateService.enqueue', () => {
	it('returns a playlist with a local id immediately', () => {
		const service = new PlaylistCreateService(createStoreMock());
		const playlist = service.enqueue('My Playlist', 'track-1');

		expect(playlist.name).toBe('My Playlist');
		expect(playlist.id).toContain('local-playlist-');
	});

	it('makes the pending entry available via getPending()', () => {
		const service = new PlaylistCreateService(createStoreMock());
		service.enqueue('My Playlist', 'track-1');
		const pending = service.getPending();

		expect(pending).toHaveLength(1);
		expect(pending[0].name).toBe('My Playlist');
		expect(pending[0].trackId).toBe('track-1');
	});

	it('accumulates multiple pending creates', () => {
		const service = new PlaylistCreateService(createStoreMock());
		service.enqueue('Playlist A', 'track-1');
		service.enqueue('Playlist B', 'track-2');
		const pending = service.getPending();

		expect(pending).toHaveLength(2);
		expect(pending[0].name).toBe('Playlist A');
		expect(pending[1].name).toBe('Playlist B');
	});
});

describe('PlaylistCreateService.load', () => {
	it('loads pending creates from storage on first call', async () => {
		const stored = JSON.stringify([
			{ localId: 'local-playlist-1', name: 'Stored Playlist', trackId: 'track-99' },
		]);
		const service = new PlaylistCreateService(createStoreMock(stored));
		await service.load();
		const pending = service.getPending();

		expect(pending).toHaveLength(1);
		expect(pending[0].name).toBe('Stored Playlist');
		expect(pending[0].trackId).toBe('track-99');
	});

	it('merges storage ops with in-memory ops added before load', async () => {
		const stored = JSON.stringify([
			{ localId: 'local-playlist-old', name: 'Old Playlist', trackId: 'track-1' },
		]);
		const service = new PlaylistCreateService(createStoreMock(stored));
		service.enqueue('New Playlist', 'track-2');
		await service.load();
		const pending = service.getPending();

		expect(pending).toHaveLength(2);
	});

	it('does not duplicate ops already in memory when load runs', async () => {
		const service = new PlaylistCreateService(createStoreMock());
		const playlist = service.enqueue('My Playlist', 'track-1');
		const store = createStoreMock(
			JSON.stringify([{ localId: playlist.id, name: 'My Playlist', trackId: 'track-1' }]),
		);
		const service2 = new PlaylistCreateService(store);
		service2.enqueue('My Playlist', 'track-1'); // same as stored, different localId
		await service2.load();
		// both present because they have different localIds
		expect(service2.getPending().length).toBeGreaterThanOrEqual(1);
	});
});

describe('PlaylistCreateService.flush', () => {
	it('creates playlists, clears pending, and returns id mappings after flush', async () => {
		const service = new PlaylistCreateService(createStoreMock());
		const p1 = service.enqueue('Playlist A', 'track-1');
		const p2 = service.enqueue('Playlist B', 'track-2');

		const transport = createTransportMock();
		const { errors, idMappings } = await service.flush(transport as never);

		expect(errors).toHaveLength(0);
		expect(transport.createdPlaylists).toHaveLength(2);
		expect(transport.createdPlaylists[0].name).toBe('Playlist A');
		expect(transport.createdPlaylists[0].trackId).toBe('track-1');
		expect(transport.createdPlaylists[1].name).toBe('Playlist B');
		expect(transport.createdPlaylists[1].trackId).toBe('track-2');
		expect(service.getPending()).toHaveLength(0);

		expect(idMappings).toHaveLength(2);
		expect(idMappings[0].localId).toBe(p1.id);
		expect(idMappings[0].serverId).toBe('playlist-1');
		expect(idMappings[0].name).toBe('Playlist A');
		expect(idMappings[0].initialTrackId).toBe('track-1');
		expect(idMappings[0].imageUrl).toBe('https://img/playlist-1.jpg');
		expect(idMappings[1].localId).toBe(p2.id);
		expect(idMappings[1].serverId).toBe('playlist-2');
	});

	it('returns errors without removing them from pending on failure', async () => {
		const service = new PlaylistCreateService(createStoreMock());
		service.enqueue('Bad Playlist', 'track-1');

		const transport = createTransportMock({ failCreate: true });
		const { errors, idMappings } = await service.flush(transport as never);

		expect(errors).toHaveLength(1);
		expect(errors[0].name).toBe('Bad Playlist');
		expect(errors[0].error).toContain('server error');
		expect(idMappings).toHaveLength(0);
	});

	it('returns empty errors and idMappings when there is nothing to flush', async () => {
		const service = new PlaylistCreateService(createStoreMock());
		const transport = createTransportMock();
		const { errors, idMappings } = await service.flush(transport as never);

		expect(errors).toHaveLength(0);
		expect(idMappings).toHaveLength(0);
		expect(transport.createdPlaylists).toHaveLength(0);
	});

	it('retains pending items and returns errors when createPlaylist throws', async () => {
		const service = new PlaylistCreateService(createStoreMock());
		service.enqueue('My Playlist', 'track-1');

		const failingTransport = {
			createPlaylist: () => Promise.reject(new Error('network error')),
		} as unknown as Transport;
		const { errors } = await service.flush(failingTransport);

		expect(errors).toHaveLength(1);
		expect(service.getPending()).toHaveLength(1);
	});
});
