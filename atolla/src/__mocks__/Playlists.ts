import type { JellyfinPlaylistItem } from '../models/jellyfin/Types';

export const mockJellyfinPlaylists: Array<JellyfinPlaylistItem> = [
	{
		"Id": "playlist-1",
		"Name": "Converge Essentials",
		"Type": "Playlist",
		"ItemIds": [
			"track-1",
			"track-3",
			"track-13",
			"track-21"
		]
	},
	{
		"Id": "playlist-2",
		"Name": "Late Night Heavy",
		"Type": "Playlist",
		"ItemIds": [
			"track-2",
			"track-4",
			"track-8",
			"track-10",
			"track-54"
		]
	},
	{
		"Id": "playlist-3",
		"Name": "New Mock Rotation",
		"Type": "Playlist",
		"ItemIds": [
			"track-5",
			"track-7",
			"track-9",
			"track-11",
			"track-27"
		]
	},
	{
		"Id": "playlist-4",
		"Name": "Post-Hardcore Spiral",
		"Type": "Playlist",
		"ItemIds": [
			"track-25",
			"track-33",
			"track-35",
			"track-57"
		]
	},
	{
		"Id": "playlist-5",
		"Name": "Hyperpop Run",
		"Type": "Playlist",
		"ItemIds": [
			"track-49",
			"track-51",
			"track-61",
			"track-62"
		]
	},
	{
		"Id": "playlist-6",
		"Name": "Soft Focus Commute",
		"Type": "Playlist",
		"ItemIds": [
			"track-37",
			"track-39",
			"track-45",
			"track-47",
			"track-67"
		]
	}
]
