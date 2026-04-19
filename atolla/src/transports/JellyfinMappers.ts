import type { Album } from '../models/Album';
import type { Artist } from '../models/Artist';
import type { Genre } from '../models/Genre';
import type {
	JellyfinAlbumItem,
	JellyfinArtistItem,
	JellyfinBaseItemDto,
	JellyfinGenreItem,
	JellyfinNameIdReference,
	JellyfinPlaylistItem,
	JellyfinTrackItem,
} from '../models/jellyfin/Types';
import type { Playlist } from '../models/Playlist';
import type { Track } from '../models/Track';

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
	const logoTag = item.ParentLogoImageTag ?? item.ImageTags?.Logo;
	const logoItemId = item.ParentLogoItemId ?? item.Id;

	return {
		bio: item.Overview,
		dateAdded: item.DateCreated,
		genres: mapGenreReferences(item),
		id: item.Id,
		imageUrl: imageResolvers.itemPrimaryImageUrl?.(item.Id, primaryTag),
		logoUrl: logoTag ? imageResolvers.itemLogoImageUrl?.(logoItemId, logoTag) : undefined,
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
		genres: mapGenreReferences(item),
		id: item.Id,
		imageUrl: imageResolvers.itemPrimaryImageUrl?.(item.Id, primaryTag),
		name: item.Name,
		releaseDate: item.PremiereDate,
	};
}

function mapGenreReferences(
	item: Pick<JellyfinBaseItemDto, 'GenreItems'>,
): Array<Genre> | undefined {
	const byId = new Map<string, Genre>();

	for (const genreItem of item.GenreItems ?? []) {
		const genreId = genreItem?.Id?.trim();
		const genreName = genreItem?.Name?.trim();
		if (!genreId || !genreName || byId.has(genreId)) {
			continue;
		}

		byId.set(genreId, {
			id: genreId,
			name: genreName,
		});
	}

	if (byId.size === 0) {
		return undefined;
	}

	return [...byId.values()].sort((left, right) => left.name.localeCompare(right.name));
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
		genres: mapGenreReferences(item),
		id: item.Id,
		name: item.Name,
		productionYear: item.ProductionYear,
		releaseDate: item.PremiereDate,
		trackNumber: item.IndexNumber,
	};
}

export function mapJellyfinPlaylistToPlaylist(
	item: JellyfinPlaylistItem,
	imageResolvers: JellyfinImageResolvers = {},
): Playlist {
	const primaryTag = item.ImageTags?.Primary;

	return {
		dateAdded: item.DateCreated,
		id: item.Id,
		imageUrl: imageResolvers.itemPrimaryImageUrl?.(item.Id, primaryTag),
		name: item.Name,
	};
}

export function mapJellyfinGenreToGenre(
	item: JellyfinGenreItem,
	imageResolvers: JellyfinImageResolvers = {},
): Genre {
	const primaryTag = item.ImageTags?.Primary;

	return {
		id: item.Id,
		imageUrl: imageResolvers.itemPrimaryImageUrl?.(item.Id, primaryTag),
		name: item.Name,
		trackCount: item.RecursiveItemCount ?? item.ChildCount,
	};
}
