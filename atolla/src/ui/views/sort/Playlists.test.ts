import { describe, expect, it } from 'bun:test';
import type { Playlist } from '../../../models/Playlist';
import { sortPlaylists } from './Playlists';

const playlists: Array<Playlist> = [
	{ dateAdded: '2022-01-01', id: '1', name: 'Playlist C' },
	{ dateAdded: '2024-01-01', id: '2', name: 'Playlist A' },
	{ id: '3', name: 'Playlist D' },
	{ dateAdded: '2023-01-01', id: '4', name: 'Playlist B' },
];

describe('sortPlaylists', () => {
	it('sorts a-z by name', () => {
		const sorted = sortPlaylists(playlists);

		expect(sorted.map((playlist) => playlist.name)).toEqual([
			'Playlist A',
			'Playlist B',
			'Playlist C',
			'Playlist D',
		]);
	});

	it('leaves the source array untouched', () => {
		sortPlaylists(playlists);

		expect(playlists.map((playlist) => playlist.name)).toEqual([
			'Playlist C',
			'Playlist A',
			'Playlist D',
			'Playlist B',
		]);
	});
});
