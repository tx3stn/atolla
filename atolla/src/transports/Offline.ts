// biome-ignore-all lint/suspicious/useAwait: async used for Transport interface conformance
import type { Album } from '../models/Album';
import type { Artist } from '../models/Artist';
import type { Playlist } from '../models/Playlist';
import type { Track } from '../models/Track';
import type { Transport } from './Transport';

// Offline transport reads from the local SQLite DB (not yet implemented).
export class OfflineTransport implements Transport {
	async getAllArtists(): Promise<Array<Artist>> {
		throw new Error('OfflineTransport not yet implemented');
	}

	async getAllAlbums(): Promise<Array<Album>> {
		throw new Error('OfflineTransport not yet implemented');
	}

	async getAlbumsByArtist(_artistId: string): Promise<Array<Album>> {
		throw new Error('OfflineTransport not yet implemented');
	}

	async getAllPlaylists(): Promise<Array<Playlist>> {
		throw new Error('OfflineTransport not yet implemented');
	}

	async getArtist(_artistId: string): Promise<Artist | null> {
		throw new Error('OfflineTransport not yet implemented');
	}

	async getArtistLogoUrl(_artistId: string): Promise<string | null> {
		throw new Error('OfflineTransport not yet implemented');
	}

	async getArtistTopTracks(_artistId: string): Promise<Array<Track>> {
		throw new Error('OfflineTransport not yet implemented');
	}

	async getTracksByAlbum(_albumId: string): Promise<Array<Track>> {
		throw new Error('OfflineTransport not yet implemented');
	}

	async getTracksByArtist(_artistId: string): Promise<Array<Track>> {
		throw new Error('OfflineTransport not yet implemented');
	}

	async getTracksByPlaylist(_playlistId: string): Promise<Array<Track>> {
		throw new Error('OfflineTransport not yet implemented');
	}
}
