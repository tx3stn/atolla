import type { JellyfinPlaylistItem } from '../models/jellyfin/Types';

export const mockJellyfinPlaylists: Array<JellyfinPlaylistItem> = [
	{
		DateCreated: '2024-04-02T09:00:00.000Z',
		Id: 'playlist-1',
		ItemIds: ['track-1', 'track-3', 'track-13', 'track-21'],
		Name: 'Converge Essentials',
		Type: 'Playlist',
	},
	{
		DateCreated: '2024-04-16T09:00:00.000Z',
		Id: 'playlist-2',
		ItemIds: ['track-2', 'track-4', 'track-8', 'track-10', 'track-54'],
		Name: 'Late Night Heavy',
		Type: 'Playlist',
	},
	{
		DateCreated: '2024-04-30T09:00:00.000Z',
		Id: 'playlist-3',
		ItemIds: ['track-5', 'track-7', 'track-9', 'track-11', 'track-27'],
		Name: 'New Mock Rotation',
		Type: 'Playlist',
	},
	{
		DateCreated: '2024-05-14T09:00:00.000Z',
		Id: 'playlist-4',
		ItemIds: ['track-25', 'track-33', 'track-35', 'track-57'],
		Name: 'Post-Hardcore Spiral',
		Type: 'Playlist',
	},
	{
		DateCreated: '2024-05-28T09:00:00.000Z',
		Id: 'playlist-5',
		ItemIds: ['track-49', 'track-51', 'track-61', 'track-62'],
		Name: 'Hyperpop Run',
		Type: 'Playlist',
	},
	{
		DateCreated: '2024-06-11T09:00:00.000Z',
		Id: 'playlist-6',
		ItemIds: ['track-37', 'track-39', 'track-45', 'track-47', 'track-67'],
		Name: 'Soft Focus Commute',
		Type: 'Playlist',
	},
];
