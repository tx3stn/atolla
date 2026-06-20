import { describe, expect, it } from 'bun:test';
import { SortOrders } from '../../../models/App';
import type { Playlist } from '../../../models/Playlist';
import { sortPlaylists } from './Playlists';

const playlists: Array<Playlist> = [
	{ dateAdded: '2022-01-01', id: '1', name: 'Playlist A' },
	{ dateAdded: '2024-01-01', id: '2', name: 'Playlist B' },
	{ id: '3', name: 'Playlist C' },
	{ dateAdded: '2023-01-01', id: '4', name: 'Playlist D' },
];

describe('sortPlaylists', () => {
	it('sorts a-z by name', () => {
		const sorted = sortPlaylists(playlists, SortOrders.aToZ);

		expect(sorted.map((playlist) => playlist.name)).toEqual([
			'Playlist A',
			'Playlist B',
			'Playlist C',
			'Playlist D',
		]);
	});

	it('sorts z-a by name', () => {
		const sorted = sortPlaylists(playlists, SortOrders.zToA);

		expect(sorted.map((playlist) => playlist.name)).toEqual([
			'Playlist D',
			'Playlist C',
			'Playlist B',
			'Playlist A',
		]);
	});

	it('sorts new-old by dateAdded and keeps missing dateAdded last', () => {
		const sorted = sortPlaylists(playlists, SortOrders.newToOld);

		expect(sorted.map((playlist) => playlist.name)).toEqual([
			'Playlist B',
			'Playlist D',
			'Playlist A',
			'Playlist C',
		]);
	});

	it('sorts old-new by dateAdded and keeps missing dateAdded last', () => {
		const sorted = sortPlaylists(playlists, SortOrders.oldToNew);

		expect(sorted.map((playlist) => playlist.name)).toEqual([
			'Playlist A',
			'Playlist D',
			'Playlist B',
			'Playlist C',
		]);
	});
});
