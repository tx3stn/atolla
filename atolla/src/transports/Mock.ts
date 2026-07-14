// biome-ignore-all lint/suspicious/useAwait: async used for Transport interface conformance
import {
	mockAlbumPrimaryImageUrls,
	mockJellyfinAlbums,
	mockJellyfinTracks,
} from '../__mocks__/Albums';
import {
	mockArtistLogoUrls,
	mockArtistPrimaryImageUrls,
	mockJellyfinArtists,
} from '../__mocks__/Artists';
import {
	mockGenrePrimaryImageUrls,
	mockGenreTrackIds,
	mockJellyfinGenres,
} from '../__mocks__/Genres';
import { mockJellyfinPlaylists } from '../__mocks__/Playlists';
import type { Album } from '../models/Album';
import type { Artist } from '../models/Artist';
import type { Genre } from '../models/Genre';
import type { JellyfinMediaSource } from '../models/jellyfin/Types';
import type { Playlist } from '../models/Playlist';
import type { SearchResults } from '../models/Search';
import type { Track } from '../models/Track';
import { trackReleaseYear } from '../models/Track';
import {
	type JellyfinImageResolvers,
	mapJellyfinAlbumToAlbum,
	mapJellyfinArtistToArtist,
	mapJellyfinGenreToGenre,
	mapJellyfinPlaylistToPlaylist,
	mapJellyfinTrackToTrack,
} from './JellyfinMappers';
import type { Transport } from './Transport';

const mockFormatCycle: Array<JellyfinMediaSource> = [
	{ MediaStreams: [{ BitDepth: 24, Codec: 'flac', SampleRate: 96000, Type: 'Audio' }] },
	{ MediaStreams: [{ BitDepth: 16, Codec: 'flac', SampleRate: 44100, Type: 'Audio' }] },
	{ MediaStreams: [{ BitRate: 320000, Codec: 'mp3', Type: 'Audio' }] },
	{ MediaStreams: [{ BitRate: 256000, Codec: 'aac', Type: 'Audio' }] },
	{ MediaStreams: [{ BitDepth: 24, Codec: 'flac', SampleRate: 44100, Type: 'Audio' }] },
	{ MediaStreams: [{ BitRate: 192000, Codec: 'vorbis', Type: 'Audio' }] },
];

// mirrors the library views' letter filter so fixtures behave like the server's prefix
// filtering: a-z matches by leading letter, '0' matches leading-digit names
function matchesNamePrefix(name: string, startsWith: string | undefined): boolean {
	const token = startsWith?.trim();
	if (!token) {
		return true;
	}
	if (token === '0') {
		return /^\d/.test(name.trim());
	}
	return name.trim().toLowerCase().startsWith(token.toLowerCase());
}

function mockMediaSourcesForAlbum(albumId: string | undefined): Array<JellyfinMediaSource> {
	const num = albumId ? Number.parseInt(albumId.replace(/\D/g, ''), 10) : 0;
	return [mockFormatCycle[(Number.isNaN(num) ? 0 : num) % mockFormatCycle.length]];
}

export class MockTransport implements Transport {
	private static readonly sampleAudioUrl =
		'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3';

	// in-memory reorder overrides so drag-to-reorder persists for the session without
	// mutating the shared fixtures. keyed by playlist id; holds the track id order
	private readonly playlistItemOrder = new Map<string, Array<string>>();

	// ids of playlists created this session. their track order lives in playlistItemOrder,
	// so a created playlist resolves like a fixture one without a full Jellyfin entry
	private readonly createdPlaylists = new Set<string>();

	private readonly imageResolvers: JellyfinImageResolvers = {
		albumPrimaryImageUrl: (albumId: string): string | undefined =>
			mockAlbumPrimaryImageUrls[albumId],
		itemLogoImageUrl: (itemId: string): string | undefined => mockArtistLogoUrls[itemId],
		itemPrimaryImageUrl: (itemId: string): string | undefined =>
			mockArtistPrimaryImageUrls[itemId] ??
			mockAlbumPrimaryImageUrls[itemId] ??
			mockGenrePrimaryImageUrls[itemId],
	};

	async addItemsToPlaylist(playlistId: string, trackIds: Array<string>): Promise<void> {
		const order = this.playlistItemOrder.get(playlistId) ?? [];
		this.playlistItemOrder.set(playlistId, [...order, ...trackIds]);
	}

	async createPlaylist(name: string, trackId?: string): Promise<Playlist> {
		const id = `playlist-${Date.now()}`;
		this.createdPlaylists.add(id);
		this.playlistItemOrder.set(id, trackId ? [trackId] : []);
		return { id, name };
	}

	async getAlbumReleaseDates(
		page: number,
		pageSize: number,
	): Promise<{ hasMore: boolean; items: Array<{ id: string; releaseDate?: string }> }> {
		const all = this.buildAllAlbums();
		const startIndex = Math.max(0, page - 1) * pageSize;
		const slice = all.slice(startIndex, startIndex + Math.max(1, pageSize));
		return {
			hasMore: startIndex + slice.length < all.length,
			items: slice.map((album) => ({ id: album.id, releaseDate: album.releaseDate })),
		};
	}

	async getAlbumsByArtist(artistId: string): Promise<Array<Album>> {
		return sortMockAlbumsByDefaultOrder(
			mockJellyfinAlbums.filter((album) =>
				(album.ArtistItems ?? []).some((artist) => artist.Id === artistId),
			),
		).map((item) => mapJellyfinAlbumToAlbum(item, this.imageResolvers));
	}

	async getAlbumsByIds(ids: Array<string>): Promise<Array<Album>> {
		const wanted = new Set(ids);
		return this.buildAllAlbums().filter((album) => wanted.has(album.id));
	}

	async getAlbums(
		page: number,
		pageSize: number,
		options?: { startsWith?: string },
	): Promise<{ hasMore: boolean; items: Array<Album> }> {
		const startIndex = Math.max(0, page - 1) * pageSize;
		const sortedAlbums = sortMockAlbumsByDefaultOrder(mockJellyfinAlbums).filter((item) =>
			matchesNamePrefix(item.Name, options?.startsWith),
		);
		const pageItems = sortedAlbums.slice(startIndex, startIndex + pageSize);

		return {
			hasMore: startIndex + pageItems.length < sortedAlbums.length,
			items: pageItems.map((item) => mapJellyfinAlbumToAlbum(item, this.imageResolvers)),
		};
	}

	async getArtist(artistId: string): Promise<Artist | null> {
		const item = mockJellyfinArtists.find((artist) => artist.Id === artistId);
		return item ? mapJellyfinArtistToArtist(item, this.imageResolvers) : null;
	}

	async getArtistLogoUrl(artistId: string): Promise<string | null> {
		return mockArtistLogoUrls[artistId] ?? null;
	}

	async getArtists(
		page: number,
		pageSize: number,
		options?: { startsWith?: string },
	): Promise<{ hasMore: boolean; items: Array<Artist> }> {
		const startIndex = Math.max(0, page - 1) * pageSize;
		const sortedArtists = [...mockJellyfinArtists]
			.sort((a, b) => a.Name.localeCompare(b.Name))
			.filter((item) => matchesNamePrefix(item.Name, options?.startsWith));
		const pageItems = sortedArtists.slice(startIndex, startIndex + pageSize);

		return {
			hasMore: startIndex + pageItems.length < sortedArtists.length,
			items: pageItems.map((item) => mapJellyfinArtistToArtist(item, this.imageResolvers)),
		};
	}

	async getArtistTopTracks(artistId: string): Promise<Array<Track>> {
		const allTracks = await this.getTracksByArtist(artistId);
		return allTracks.slice(0, 5);
	}

	async getGenre(genreId: string): Promise<Genre | null> {
		const item = mockJellyfinGenres.find((genre) => genre.Id === genreId);
		return item ? mapJellyfinGenreToGenre(item, this.imageResolvers) : null;
	}

	async getGenres(
		page: number,
		pageSize: number,
	): Promise<{ hasMore: boolean; items: Array<Genre> }> {
		const startIndex = Math.max(0, page - 1) * pageSize;
		const sortedGenres = [...mockJellyfinGenres].sort((a, b) => a.Name.localeCompare(b.Name));
		const pageItems = sortedGenres.slice(startIndex, startIndex + pageSize);

		return {
			hasMore: startIndex + pageItems.length < sortedGenres.length,
			items: pageItems.map((item) => mapJellyfinGenreToGenre(item, this.imageResolvers)),
		};
	}

	async getPlaylist(playlistId: string): Promise<Playlist | null> {
		const item = mockJellyfinPlaylists.find((playlist) => playlist.Id === playlistId);
		return item ? mapJellyfinPlaylistToPlaylist(item, this.imageResolvers) : null;
	}

	async getPlaylists(
		page: number,
		pageSize: number,
		options?: { startsWith?: string },
	): Promise<{ hasMore: boolean; items: Array<Playlist> }> {
		const startIndex = Math.max(0, page - 1) * pageSize;
		const sortedPlaylists = [...mockJellyfinPlaylists]
			.sort((a, b) => a.Name.localeCompare(b.Name))
			.filter((item) => matchesNamePrefix(item.Name, options?.startsWith));
		const pageItems = sortedPlaylists.slice(startIndex, startIndex + pageSize);

		return {
			hasMore: startIndex + pageItems.length < sortedPlaylists.length,
			items: pageItems.map((item) => mapJellyfinPlaylistToPlaylist(item, this.imageResolvers)),
		};
	}

	async getRandomAlbum(): Promise<Album | null> {
		const albums = sortMockAlbumsByDefaultOrder(mockJellyfinAlbums);
		if (albums.length === 0) {
			return null;
		}
		const index = Math.floor(Math.random() * albums.length);
		const item = albums[index];
		return item ? mapJellyfinAlbumToAlbum(item, this.imageResolvers) : null;
	}

	async getRandomMusicYears(limit: number): Promise<Array<number>> {
		const years = new Set<number>();
		for (const track of this.buildAllTracks()) {
			const year = trackReleaseYear(track);
			if (year != null) {
				years.add(year);
			}
		}

		return shuffleTracks([...years]).slice(0, Math.max(0, limit));
	}

	async getRecentlyAddedAlbums(limit: number): Promise<Array<Album>> {
		return sortMockAlbumsByDefaultOrder(mockJellyfinAlbums)
			.slice(0, limit)
			.map((item) => mapJellyfinAlbumToAlbum(item, this.imageResolvers));
	}

	async getShuffledLibraryTracks(
		page: number,
		pageSize: number,
	): Promise<{ hasMore: boolean; items: Array<Track> }> {
		const allTracks = mockJellyfinTracks
			.map((item) =>
				mapJellyfinTrackToTrack(
					{ ...item, MediaSources: mockMediaSourcesForAlbum(item.AlbumId) },
					this.imageResolvers,
				),
			)
			.sort((a, b) => a.id.localeCompare(b.id));
		const startIndex = Math.max(0, page - 1) * pageSize;
		const items = allTracks.slice(startIndex, startIndex + pageSize);
		return {
			hasMore: startIndex + items.length < allTracks.length,
			items,
		};
	}

	getTrackCacheUrl(_trackId: string): string | null {
		return MockTransport.sampleAudioUrl;
	}

	async getTracksByAlbum(albumId: string): Promise<Array<Track>> {
		return mockJellyfinTracks
			.filter((track) => track.AlbumId === albumId)
			.map((item) =>
				mapJellyfinTrackToTrack(
					{ ...item, MediaSources: mockMediaSourcesForAlbum(item.AlbumId) },
					this.imageResolvers,
				),
			);
	}

	async getTracksByArtist(artistId: string): Promise<Array<Track>> {
		const albumsById = new Map(mockJellyfinAlbums.map((album) => [album.Id, album]));

		return mockJellyfinTracks
			.filter((track) => (track.ArtistItems ?? []).some((artist) => artist.Id === artistId))
			.sort((a, b) => {
				const aRelease = (a.AlbumId ? albumsById.get(a.AlbumId)?.PremiereDate : undefined) ?? '';
				const bRelease = (b.AlbumId ? albumsById.get(b.AlbumId)?.PremiereDate : undefined) ?? '';
				return bRelease.localeCompare(aRelease);
			})
			.map((item) =>
				mapJellyfinTrackToTrack(
					{ ...item, MediaSources: mockMediaSourcesForAlbum(item.AlbumId) },
					this.imageResolvers,
				),
			);
	}

	async getTracksByGenre(
		genreId: string,
		page: number,
		pageSize: number,
	): Promise<{ hasMore: boolean; items: Array<Track>; totalCount: number }> {
		const allTracks = await this.collectGenreTracks(genreId);
		const startIndex = Math.max(0, page - 1) * pageSize;
		const items = allTracks.slice(startIndex, startIndex + pageSize);

		return {
			hasMore: startIndex + items.length < allTracks.length,
			items,
			totalCount: allTracks.length,
		};
	}

	async getTracksByPlaylist(
		playlistId: string,
		page: number,
		pageSize: number,
	): Promise<{ hasMore: boolean; items: Array<Track>; totalCount?: number }> {
		const allTracks = await this.collectPlaylistTracks(playlistId);
		const startIndex = Math.max(0, page - 1) * pageSize;
		const items = allTracks.slice(startIndex, startIndex + pageSize);
		return {
			hasMore: startIndex + items.length < allTracks.length,
			items,
			totalCount: allTracks.length,
		};
	}

	async getTracksByYear(
		year: number,
		page: number,
		pageSize: number,
	): Promise<{ hasMore: boolean; items: Array<Track> }> {
		const yearTracks = this.buildAllTracks()
			.filter((track) => trackReleaseYear(track) === year)
			.sort((a, b) => a.id.localeCompare(b.id));
		const startIndex = Math.max(0, page - 1) * pageSize;
		const items = yearTracks.slice(startIndex, startIndex + pageSize);
		return {
			hasMore: startIndex + items.length < yearTracks.length,
			items,
		};
	}

	async movePlaylistTrack(playlistId: string, trackId: string, toIndex: number): Promise<void> {
		const playlist = mockJellyfinPlaylists.find((candidate) => candidate.Id === playlistId);
		if (!playlist) {
			return;
		}

		const order = [...(this.playlistItemOrder.get(playlistId) ?? playlist.ItemIds ?? [])];
		const fromIndex = order.indexOf(trackId);
		if (fromIndex === -1) {
			return;
		}

		const [moved] = order.splice(fromIndex, 1);
		const clampedIndex = Math.max(0, Math.min(order.length, toIndex));
		order.splice(clampedIndex, 0, moved);
		this.playlistItemOrder.set(playlistId, order);
	}

	async removePlaylistTrack(_playlistId: string, _trackId: string): Promise<void> {}

	async scrobbleTrackPlayed(_trackId: string, _datePlayed: string): Promise<void> {}

	async search(query: string): Promise<SearchResults> {
		const normalizedQuery = query.trim().toLowerCase();
		if (!normalizedQuery) {
			return {
				albums: [],
				artists: [],
				playlists: [],
				tracks: [],
			};
		}

		const artists = mockJellyfinArtists
			.filter((artist) => artist.Name.toLowerCase().includes(normalizedQuery))
			.map((item) => mapJellyfinArtistToArtist(item, this.imageResolvers));

		const albums = mockJellyfinAlbums
			.filter((album) => album.Name.toLowerCase().includes(normalizedQuery))
			.map((item) => mapJellyfinAlbumToAlbum(item, this.imageResolvers));

		const playlists = mockJellyfinPlaylists
			.filter((playlist) => playlist.Name.toLowerCase().includes(normalizedQuery))
			.map((item) => mapJellyfinPlaylistToPlaylist(item, this.imageResolvers));

		const tracks = mockJellyfinTracks
			.filter((track) => track.Name.toLowerCase().includes(normalizedQuery))
			.map((item) =>
				mapJellyfinTrackToTrack(
					{ ...item, MediaSources: mockMediaSourcesForAlbum(item.AlbumId) },
					this.imageResolvers,
				),
			);

		return {
			albums,
			artists,
			playlists,
			tracks,
		};
	}

	private buildAllAlbums(): Array<Album> {
		return sortMockAlbumsByDefaultOrder(mockJellyfinAlbums).map((item) =>
			mapJellyfinAlbumToAlbum(item, this.imageResolvers),
		);
	}

	private buildAllTracks(): Array<Track> {
		return mockJellyfinTracks.map((item) =>
			mapJellyfinTrackToTrack(
				{ ...item, MediaSources: mockMediaSourcesForAlbum(item.AlbumId) },
				this.imageResolvers,
			),
		);
	}

	private async collectGenreTracks(genreId: string): Promise<Array<Track>> {
		const trackIds = mockGenreTrackIds[genreId] ?? [];
		const tracksById = new Map(mockJellyfinTracks.map((track) => [track.Id, track]));

		return trackIds.flatMap((trackId) => {
			const item = tracksById.get(trackId);
			return item
				? [
						mapJellyfinTrackToTrack(
							{ ...item, MediaSources: mockMediaSourcesForAlbum(item.AlbumId) },
							this.imageResolvers,
						),
					]
				: [];
		});
	}

	private async collectPlaylistTracks(playlistId: string): Promise<Array<Track>> {
		const playlist = mockJellyfinPlaylists.find((candidate) => candidate.Id === playlistId);
		if (!playlist && !this.createdPlaylists.has(playlistId)) {
			return [];
		}

		const trackIds = this.playlistItemOrder.get(playlistId) ?? playlist?.ItemIds ?? [];
		const tracksById = new Map(mockJellyfinTracks.map((track) => [track.Id, track]));

		return trackIds.flatMap((trackId) => {
			const item = tracksById.get(trackId);
			return item
				? [
						mapJellyfinTrackToTrack(
							{
								...item,
								MediaSources: mockMediaSourcesForAlbum(item.AlbumId),
								PlaylistItemId: trackId,
							},
							this.imageResolvers,
						),
					]
				: [];
		});
	}
}

function shuffleTracks<T>(tracks: Array<T>): Array<T> {
	const copy = [...tracks];
	for (let i = copy.length - 1; i > 0; i--) {
		const randomIndex = Math.floor(Math.random() * (i + 1));
		[copy[i], copy[randomIndex]] = [copy[randomIndex], copy[i]];
	}
	return copy;
}

function sortMockAlbumsByDefaultOrder(albums: Array<(typeof mockJellyfinAlbums)[number]>) {
	return [...albums].sort((left, right) => {
		const byDate = compareDatesDescending(left.PremiereDate, right.PremiereDate);
		if (byDate !== 0) {
			return byDate;
		}

		return left.Name.localeCompare(right.Name);
	});
}

function compareDatesDescending(left: string | undefined, right: string | undefined): number {
	const leftTime = parseDateTime(left);
	const rightTime = parseDateTime(right);

	if (leftTime == null && rightTime == null) return 0;
	if (leftTime == null) return 1;
	if (rightTime == null) return -1;

	return rightTime - leftTime;
}

function parseDateTime(value: string | undefined): number | null {
	if (!value) {
		return null;
	}

	const time = Date.parse(value);
	if (Number.isNaN(time)) {
		return null;
	}

	return time;
}
