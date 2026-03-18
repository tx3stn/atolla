// biome-ignore-all lint/suspicious/useAwait: async used for Transport interface conformance
import { type MockRawAlbum, mockRawAlbums } from '../__mocks__/Albums';
import { mockArtists } from '../__mocks__/Artists';
import { mockRawPlaylists } from '../__mocks__/Playlists';
import type { Album } from '../models/Album';
import type { Artist } from '../models/Artist';
import type { Playlist } from '../models/Playlist';
import type { Track } from '../models/Track';
import type { Transport } from './Transport';

export class MockTransport implements Transport {
	async getAllArtists(): Promise<Array<Artist>> {
		return mockArtists;
	}

	async getAllAlbums(): Promise<Array<Album>> {
		return mockRawAlbums.map((raw) => this.mapAlbum(raw));
	}

	async getAlbumsByArtist(artistId: string): Promise<Array<Album>> {
		const artist = mockArtists.find((a) => a.id === artistId);
		if (!artist) return [];
		return mockRawAlbums
			.filter((raw) => raw.albumArtist === artist.name)
			.map((raw) => this.mapAlbum(raw));
	}

	async getAllPlaylists(): Promise<Array<Playlist>> {
		return mockRawPlaylists.map(({ id, name }) => ({ id, name }));
	}

	async getTracksByAlbum(albumId: string): Promise<Array<Track>> {
		const album = mockRawAlbums.find((a) => a.id === albumId);
		if (!album) return [];
		return album.tracks.map((t) => ({
			albumId: album.id,
			albumName: album.title,
			artistName: album.albumArtist,
			duration: t.durationSeconds,
			id: t.id,
			name: t.title,
			trackNumber: t.trackNumber,
		}));
	}

	async getTracksByPlaylist(playlistId: string): Promise<Array<Track>> {
		const playlist = mockRawPlaylists.find((p) => p.id === playlistId);
		if (!playlist) return [];
		return playlist.trackIds.flatMap((trackId) => {
			for (const album of mockRawAlbums) {
				const track = album.tracks.find((t) => t.id === trackId);
				if (track) {
					return [
						{
							albumId: album.id,
							albumName: album.title,
							artistName: album.albumArtist,
							duration: track.durationSeconds,
							id: track.id,
							name: track.title,
							trackNumber: track.trackNumber,
						},
					];
				}
			}
			return [];
		});
	}

	private mapAlbum(raw: MockRawAlbum): Album {
		const artist = mockArtists.find((a) => a.name === raw.albumArtist);
		return {
			artistId: artist?.id ?? '',
			artistName: raw.albumArtist,
			id: raw.id,
			imageUrl: raw.artwork,
			name: raw.title,
			year: raw.releaseYear,
		};
	}
}
