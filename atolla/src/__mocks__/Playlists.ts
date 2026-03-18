export interface MockRawPlaylist {
	id: string;
	name: string;
	trackIds: Array<string>;
}

export const mockRawPlaylists: Array<MockRawPlaylist> = [
	{
		id: 'playlist-1',
		name: 'Converge Essentials',
		trackIds: ['track-1', 'track-3', 'track-13', 'track-21'],
	},
	{
		id: 'playlist-2',
		name: 'Late Night Heavy',
		trackIds: ['track-2', 'track-4', 'track-8', 'track-10', 'track-54'],
	},
	{
		id: 'playlist-3',
		name: 'New Mock Rotation',
		trackIds: ['track-5', 'track-7', 'track-9', 'track-11', 'track-27'],
	},
	{
		id: 'playlist-4',
		name: 'Post-Hardcore Spiral',
		trackIds: ['track-25', 'track-33', 'track-35', 'track-57'],
	},
	{
		id: 'playlist-5',
		name: 'Hyperpop Run',
		trackIds: ['track-49', 'track-51', 'track-61', 'track-62'],
	},
	{
		id: 'playlist-6',
		name: 'Soft Focus Commute',
		trackIds: ['track-37', 'track-39', 'track-45', 'track-47', 'track-67'],
	},
];
