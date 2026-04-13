import type { JellyfinGenreItem } from '../models/jellyfin/Types';

export const mockJellyfinGenres: Array<JellyfinGenreItem> = [
	{ Id: 'genre-1', ImageTags: { Primary: 'mock' }, Name: 'Post-Hardcore', Type: 'MusicGenre' },
	{ Id: 'genre-2', ImageTags: { Primary: 'mock' }, Name: 'Noise Rock', Type: 'MusicGenre' },
	{ Id: 'genre-3', ImageTags: { Primary: 'mock' }, Name: 'Industrial', Type: 'MusicGenre' },
	{ Id: 'genre-4', ImageTags: { Primary: 'mock' }, Name: 'Shoegaze', Type: 'MusicGenre' },
	{ Id: 'genre-5', ImageTags: { Primary: 'mock' }, Name: 'Hyperpop', Type: 'MusicGenre' },
	{ Id: 'genre-6', ImageTags: { Primary: 'mock' }, Name: 'Black Metal', Type: 'MusicGenre' },
	{ Id: 'genre-7', ImageTags: { Primary: 'mock' }, Name: 'Hardcore Punk', Type: 'MusicGenre' },
	{ Id: 'genre-8', ImageTags: { Primary: 'mock' }, Name: 'Alternative', Type: 'MusicGenre' },
];

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
