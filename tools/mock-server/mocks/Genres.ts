import type { JellyfinGenreItem } from '../../../atolla/src/models/jellyfin/Types';
import { mockJellyfinAlbums, mockJellyfinTracks } from './Albums';

const albumGenreMap = new Map(mockJellyfinAlbums.map((a) => [a.Id, a.GenreItems ?? []]));

export const mockGenreTrackIds: Record<string, Array<string>> = {};
for (const track of mockJellyfinTracks) {
	for (const genre of albumGenreMap.get(track.AlbumId ?? '') ?? []) {
		if (!mockGenreTrackIds[genre.Id]) mockGenreTrackIds[genre.Id] = [];
		mockGenreTrackIds[genre.Id].push(track.Id);
	}
}

const GENRE_METADATA = [
	{ Id: 'genre-1', Name: 'Metalcore' },
	{ Id: 'genre-2', Name: 'Post-Hardcore' },
	{ Id: 'genre-3', Name: 'Screamo' },
	{ Id: 'genre-4', Name: 'Hardcore' },
	{ Id: 'genre-5', Name: 'Noise Rock' },
	{ Id: 'genre-6', Name: 'Black Metal' },
	{ Id: 'genre-7', Name: 'Doom Metal' },
	{ Id: 'genre-8', Name: 'Industrial' },
	{ Id: 'genre-9', Name: 'Hyperpop' },
	{ Id: 'genre-10', Name: 'Synth-pop' },
	{ Id: 'genre-11', Name: 'Indie Pop' },
	{ Id: 'genre-12', Name: 'Shoegaze' },
];

export const mockJellyfinGenres: Array<JellyfinGenreItem> = GENRE_METADATA.map((g) => ({
	Id: g.Id,
	ImageTags: { Primary: 'mock' },
	Name: g.Name,
	RecursiveItemCount: mockGenreTrackIds[g.Id]?.length ?? 0,
	Type: 'MusicGenre',
}));

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
	'genre-9':
		'https://images.unsplash.com/photo-1571330735066-03aaa9429d89?auto=format&fit=crop&w=1000&q=80',
	'genre-10':
		'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?auto=format&fit=crop&w=1000&q=80',
	'genre-11':
		'https://images.unsplash.com/photo-1487180144351-b8472da7d491?auto=format&fit=crop&w=1000&q=80',
	'genre-12':
		'https://images.unsplash.com/photo-1519412957820-df091cc20081?auto=format&fit=crop&w=1000&q=80',
};
