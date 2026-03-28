// biome-ignore-all lint/suspicious/useAwait: async used for Transport interface conformance

import { TransportErrors } from '../errors/TransportErrors';
import type { Album } from '../models/Album';
import type { Artist } from '../models/Artist';
import type { Playlist } from '../models/Playlist';
import type { SearchResults } from '../models/Search';
import type { Track } from '../models/Track';
import type { Transport } from './Transport';

// Offline transport reads from the local SQLite DB (not yet implemented).
export class OfflineTransport implements Transport {
	async getAllArtists(): Promise<Array<Artist>> {
		throw TransportErrors.OFFLINE_NOT_IMPLEMENTED;
	}

	async getAllAlbums(): Promise<Array<Album>> {
		throw TransportErrors.OFFLINE_NOT_IMPLEMENTED;
	}

	async getAlbumsByArtist(_artistId: string): Promise<Array<Album>> {
		throw TransportErrors.OFFLINE_NOT_IMPLEMENTED;
	}

	async getAllPlaylists(): Promise<Array<Playlist>> {
		throw TransportErrors.OFFLINE_NOT_IMPLEMENTED;
	}

	async getArtist(_artistId: string): Promise<Artist | null> {
		throw TransportErrors.OFFLINE_NOT_IMPLEMENTED;
	}

	async getArtistLogoUrl(_artistId: string): Promise<string | null> {
		throw TransportErrors.OFFLINE_NOT_IMPLEMENTED;
	}

	async getArtistTopTracks(_artistId: string): Promise<Array<Track>> {
		throw TransportErrors.OFFLINE_NOT_IMPLEMENTED;
	}

	async search(_query: string): Promise<SearchResults> {
		throw TransportErrors.OFFLINE_NOT_IMPLEMENTED;
	}

	async getTracksByAlbum(_albumId: string): Promise<Array<Track>> {
		throw TransportErrors.OFFLINE_NOT_IMPLEMENTED;
	}

	async getTracksByArtist(_artistId: string): Promise<Array<Track>> {
		throw TransportErrors.OFFLINE_NOT_IMPLEMENTED;
	}

	async getTracksByPlaylist(_playlistId: string): Promise<Array<Track>> {
		throw TransportErrors.OFFLINE_NOT_IMPLEMENTED;
	}
}
