import { describe, expect, it } from 'bun:test';
import {
	addTracksToPlaylist,
	createPlaylistAndAddTracks,
	selectQueueTracksForPlaylist,
} from './CreatePlaylist';

const tracks = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }, { id: 'e' }];

describe('selectQueueTracksForPlaylist', () => {
	it('includes played, current and up next in queue order when both options are on', () => {
		const result = selectQueueTracksForPlaylist(tracks, 2, {
			includePlayed: true,
			includeUpNext: true,
		});
		expect(result.map((t) => t.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
	});

	it('drops already played tracks when includePlayed is off', () => {
		const result = selectQueueTracksForPlaylist(tracks, 2, {
			includePlayed: false,
			includeUpNext: true,
		});
		expect(result.map((t) => t.id)).toEqual(['c', 'd', 'e']);
	});

	it('drops up next tracks when includeUpNext is off', () => {
		const result = selectQueueTracksForPlaylist(tracks, 2, {
			includePlayed: true,
			includeUpNext: false,
		});
		expect(result.map((t) => t.id)).toEqual(['a', 'b', 'c']);
	});

	it('always includes the current track even when both options are off', () => {
		const result = selectQueueTracksForPlaylist(tracks, 2, {
			includePlayed: false,
			includeUpNext: false,
		});
		expect(result.map((t) => t.id)).toEqual(['c']);
	});

	it('handles the current track being first', () => {
		const result = selectQueueTracksForPlaylist(tracks, 0, {
			includePlayed: true,
			includeUpNext: true,
		});
		expect(result.map((t) => t.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
	});

	it('handles the current track being last', () => {
		const result = selectQueueTracksForPlaylist(tracks, 4, {
			includePlayed: true,
			includeUpNext: true,
		});
		expect(result.map((t) => t.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
	});

	it('returns an empty array for an empty queue', () => {
		const result = selectQueueTracksForPlaylist([], 0, {
			includePlayed: true,
			includeUpNext: true,
		});
		expect(result).toEqual([]);
	});

	it('returns an empty array when the current index is out of range', () => {
		const result = selectQueueTracksForPlaylist(tracks, 99, {
			includePlayed: false,
			includeUpNext: false,
		});
		expect(result).toEqual([]);
	});
});

describe('addTracksToPlaylist', () => {
	it('adds every track in order', async () => {
		const added: Array<string> = [];
		await addTracksToPlaylist(
			'pl-1',
			[{ id: 'a' }, { id: 'b' }, { id: 'c' }],
			(_playlistId, trackId) => {
				added.push(trackId);
				return Promise.resolve();
			},
		);
		expect(added).toEqual(['a', 'b', 'c']);
	});

	it('does nothing when there is no add function', async () => {
		await expect(addTracksToPlaylist('pl-1', [{ id: 'a' }], undefined)).resolves.toBeUndefined();
	});
});

describe('createPlaylistAndAddTracks', () => {
	it('creates the playlist then adds every track in order', async () => {
		const added: Array<string> = [];
		const playlist = await createPlaylistAndAddTracks(
			'My Playlist',
			async (name) => ({ id: 'pl-1', name }),
			(_playlistId, trackId) => {
				added.push(trackId);
				return Promise.resolve();
			},
			[{ id: 'a' }, { id: 'b' }, { id: 'c' }],
		);
		expect(playlist.id).toBe('pl-1');
		expect(added).toEqual(['a', 'b', 'c']);
	});
});
