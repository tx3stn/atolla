import type { JellyfinGenreItem } from '../models/jellyfin/Types';

export const mockJellyfinGenres: Array<JellyfinGenreItem> = [
	{
		Id: 'genre-1',
		ImageTags: { Primary: 'mock' },
		Name: 'Post-Hardcore',
		RecursiveItemCount: 14,
		Type: 'MusicGenre',
	},
	{
		Id: 'genre-2',
		ImageTags: { Primary: 'mock' },
		Name: 'Noise Rock',
		RecursiveItemCount: 10,
		Type: 'MusicGenre',
	},
	{
		Id: 'genre-3',
		ImageTags: { Primary: 'mock' },
		Name: 'Industrial',
		RecursiveItemCount: 8,
		Type: 'MusicGenre',
	},
	{
		Id: 'genre-4',
		ImageTags: { Primary: 'mock' },
		Name: 'Shoegaze',
		RecursiveItemCount: 7,
		Type: 'MusicGenre',
	},
	{
		Id: 'genre-5',
		ImageTags: { Primary: 'mock' },
		Name: 'Hyperpop',
		RecursiveItemCount: 11,
		Type: 'MusicGenre',
	},
	{
		Id: 'genre-6',
		ImageTags: { Primary: 'mock' },
		Name: 'Black Metal',
		RecursiveItemCount: 9,
		Type: 'MusicGenre',
	},
	{
		Id: 'genre-7',
		ImageTags: { Primary: 'mock' },
		Name: 'Hardcore Punk',
		RecursiveItemCount: 16,
		Type: 'MusicGenre',
	},
	{
		Id: 'genre-8',
		ImageTags: { Primary: 'mock' },
		Name: 'Alternative',
		RecursiveItemCount: 12,
		Type: 'MusicGenre',
	},
];

export const mockGenreTrackIds: Record<string, Array<string>> = {
	'genre-1': ['track-1', 'track-2', 'track-8', 'track-10', 'track-13', 'track-21'],
	'genre-2': ['track-3', 'track-4', 'track-5', 'track-7', 'track-11'],
	'genre-3': ['track-49', 'track-51', 'track-54', 'track-57'],
	'genre-4': ['track-37', 'track-39', 'track-45', 'track-47'],
	'genre-5': ['track-61', 'track-62', 'track-67'],
	'genre-6': ['track-25', 'track-27', 'track-33', 'track-35'],
	'genre-7': ['track-9', 'track-14', 'track-15', 'track-16', 'track-17', 'track-18'],
	'genre-8': ['track-41', 'track-42', 'track-43', 'track-44', 'track-46'],
};

export const mockGenrePrimaryImageUrls: Record<string, string> = {
	'genre-1':
		'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=1000&q=80',
	'genre-2':
		'https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&w=1000&q=80',
	'genre-3':
		'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?auto=format&fit=crop&w=1000&q=80',
	'genre-4':
		'https://images.unsplash.com/photo-1460723237483-7a6dc9d0b212?auto=format&fit=crop&w=1000&q=80',
	'genre-5':
		'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=1000&q=80',
	'genre-6':
		'https://images.unsplash.com/photo-1429962714451-bb934ecdc4ec?auto=format&fit=crop&w=1000&q=80',
	'genre-7':
		'https://images.unsplash.com/photo-1501612780327-45045538702b?auto=format&fit=crop&w=1000&q=80',
	'genre-8':
		'https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=1000&q=80',
};
