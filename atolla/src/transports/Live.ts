// biome-ignore-all lint/suspicious/useAwait: async used for Transport interface conformance
import type { Album } from '../models/Album';
import type { Artist } from '../models/Artist';
import type {
	JellyfinAlbumItem,
	JellyfinArtistItem,
	JellyfinBaseItemDto,
	JellyfinNameIdReference,
	JellyfinPlaylistItem,
	JellyfinTrackItem,
} from '../models/jellyfin/Types';
import type { Playlist } from '../models/Playlist';
import type { SearchResults } from '../models/Search';
import type { Track } from '../models/Track';
import type { Transport } from './Transport';

// Live transport makes requests to the Jellyfin server (not yet implemented).
export class LiveTransport implements Transport {
	async getAllArtists(): Promise<Array<Artist>> {
		throw new Error('LiveTransport not yet implemented');
	}

	async getAllAlbums(): Promise<Array<Album>> {
		throw new Error('LiveTransport not yet implemented');
	}

	async getAlbumsByArtist(_artistId: string): Promise<Array<Album>> {
		throw new Error('LiveTransport not yet implemented');
	}

	async getAllPlaylists(): Promise<Array<Playlist>> {
		throw new Error('LiveTransport not yet implemented');
	}

	async getArtist(_artistId: string): Promise<Artist | null> {
		throw new Error('LiveTransport not yet implemented');
	}

	async getArtistLogoUrl(_artistId: string): Promise<string | null> {
		throw new Error('LiveTransport not yet implemented');
	}

	async getArtistTopTracks(_artistId: string): Promise<Array<Track>> {
		throw new Error('LiveTransport not yet implemented');
	}

	async search(_query: string): Promise<SearchResults> {
		throw new Error('LiveTransport not yet implemented');
	}

	async getTracksByAlbum(_albumId: string): Promise<Array<Track>> {
		throw new Error('LiveTransport not yet implemented');
	}

	async getTracksByArtist(_artistId: string): Promise<Array<Track>> {
		throw new Error('LiveTransport not yet implemented');
	}

	async getTracksByPlaylist(_playlistId: string): Promise<Array<Track>> {
		throw new Error('LiveTransport not yet implemented');
	}
}

const ticksPerSecond = 10_000_000;

export interface JellyfinImageResolvers {
	albumPrimaryImageUrl?: (albumId: string, imageTag?: string) => string | undefined;
	itemLogoImageUrl?: (itemId: string, imageTag?: string) => string | undefined;
	itemPrimaryImageUrl?: (itemId: string, imageTag?: string) => string | undefined;
}

export function runTimeTicksToSeconds(runTimeTicks?: number): number {
	if (!runTimeTicks || runTimeTicks <= 0) {
		return 0;
	}

	return Math.floor(runTimeTicks / ticksPerSecond);
}

export function resolvePrimaryArtist(
	item: Pick<JellyfinBaseItemDto, 'AlbumArtist' | 'AlbumArtists' | 'ArtistItems'>,
): JellyfinNameIdReference | null {
	const fromArtistItems = item.ArtistItems?.[0];
	if (fromArtistItems?.Id && fromArtistItems?.Name) {
		return fromArtistItems;
	}

	const fromAlbumArtists = item.AlbumArtists?.[0];
	if (fromAlbumArtists?.Id && fromAlbumArtists?.Name) {
		return fromAlbumArtists;
	}

	if (item.AlbumArtist && item.AlbumArtist.length > 0) {
		return { Id: '', Name: item.AlbumArtist };
	}

	return null;
}

export function mapJellyfinArtistToArtist(
	item: JellyfinArtistItem,
	imageResolvers: JellyfinImageResolvers = {},
): Artist {
	const primaryTag = item.ImageTags?.Primary;
	const logoItemId = item.ParentLogoItemId ?? item.Id;

	return {
		bio: item.Overview,
		id: item.Id,
		imageUrl: imageResolvers.itemPrimaryImageUrl?.(item.Id, primaryTag),
		logoUrl: imageResolvers.itemLogoImageUrl?.(logoItemId, item.ParentLogoImageTag),
		name: item.Name,
	};
}

export function mapJellyfinAlbumToAlbum(
	item: JellyfinAlbumItem,
	imageResolvers: JellyfinImageResolvers = {},
): Album {
	const primaryArtist = resolvePrimaryArtist(item);
	const primaryTag = item.ImageTags?.Primary;

	return {
		artistId: primaryArtist?.Id ?? '',
		artistName: primaryArtist?.Name ?? '',
		bio: item.Overview,
		id: item.Id,
		imageUrl: imageResolvers.itemPrimaryImageUrl?.(item.Id, primaryTag),
		name: item.Name,
		releaseDate: item.PremiereDate,
	};
}

export function mapJellyfinTrackToTrack(
	item: JellyfinTrackItem,
	imageResolvers: JellyfinImageResolvers = {},
): Track {
	const primaryArtist = resolvePrimaryArtist(item);

	return {
		albumId: item.AlbumId,
		albumImageUrl:
			item.AlbumId != null
				? imageResolvers.albumPrimaryImageUrl?.(item.AlbumId, item.AlbumPrimaryImageTag)
				: undefined,
		albumName: item.Album,
		artistId: primaryArtist?.Id || undefined,
		artistName: primaryArtist?.Name,
		duration: runTimeTicksToSeconds(item.RunTimeTicks),
		id: item.Id,
		name: item.Name,
		trackNumber: item.IndexNumber,
	};
}

export function mapJellyfinPlaylistToPlaylist(
	item: JellyfinPlaylistItem,
	imageResolvers: JellyfinImageResolvers = {},
): Playlist {
	const primaryTag = item.ImageTags?.Primary;

	return {
		id: item.Id,
		imageUrl: imageResolvers.itemPrimaryImageUrl?.(item.Id, primaryTag),
		name: item.Name,
	};
}
