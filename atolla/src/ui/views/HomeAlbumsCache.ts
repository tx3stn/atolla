import type { Album } from '../../models/Album';
import type { Genre } from '../../models/Genre';

function isGenreLike(value: unknown): value is Genre {
	if (!value || typeof value !== 'object') {
		return false;
	}

	const candidate = value as Partial<Genre>;
	return typeof candidate.id === 'string' && typeof candidate.name === 'string';
}

function normalizeGenres(genres?: Array<Genre>): Array<Genre> | undefined {
	if (!genres || genres.length === 0) {
		return undefined;
	}

	const normalized = genres
		.filter((genre) => isGenreLike(genre))
		.map((genre) => ({
			id: genre.id,
			name: genre.name,
		}));

	return normalized.length > 0 ? normalized : undefined;
}

function isAlbumLike(value: unknown): value is Album {
	if (!value || typeof value !== 'object') {
		return false;
	}

	const candidate = value as Partial<Album>;
	if (
		typeof candidate.artistId !== 'string' ||
		typeof candidate.artistName !== 'string' ||
		typeof candidate.id !== 'string' ||
		typeof candidate.name !== 'string'
	) {
		return false;
	}

	if (candidate.bio != null && typeof candidate.bio !== 'string') {
		return false;
	}

	if (candidate.imageUrl != null && typeof candidate.imageUrl !== 'string') {
		return false;
	}

	if (candidate.releaseDate != null && typeof candidate.releaseDate !== 'string') {
		return false;
	}

	if (
		candidate.genres != null &&
		(!Array.isArray(candidate.genres) || !candidate.genres.every((genre) => isGenreLike(genre)))
	) {
		return false;
	}

	return true;
}

function normalizeAlbum(album: Album): Album {
	const genres = normalizeGenres(album.genres);

	return {
		artistId: album.artistId,
		artistName: album.artistName,
		...(album.bio ? { bio: album.bio } : {}),
		...(genres ? { genres } : {}),
		id: album.id,
		...(album.imageUrl ? { imageUrl: album.imageUrl } : {}),
		name: album.name,
		...(album.releaseDate ? { releaseDate: album.releaseDate } : {}),
	};
}

export function parseHomeAlbumsCache(raw: string): Array<Album> | null {
	try {
		const parsed = JSON.parse(raw) as unknown;
		const albums = Array.isArray(parsed)
			? parsed
			: parsed &&
					typeof parsed === 'object' &&
					Array.isArray((parsed as { albums?: unknown }).albums)
				? (parsed as { albums: Array<unknown> }).albums
				: null;
		if (!albums) {
			return null;
		}

		const normalizedAlbums: Array<Album> = [];
		for (const entry of albums) {
			if (!isAlbumLike(entry)) {
				continue;
			}
			normalizedAlbums.push(normalizeAlbum(entry));
		}

		if (normalizedAlbums.length === 0 && albums.length > 0) {
			return null;
		}

		return normalizedAlbums;
	} catch {
		return null;
	}
}

export function serializeHomeAlbumsCache(albums: Array<Album>): string {
	return JSON.stringify({
		albums: albums.map((album) => normalizeAlbum(album)),
		version: 1,
	});
}

export function createHomeAlbumsSignature(albums: Array<Album>): string {
	return albums
		.map((album) => {
			const normalized = normalizeAlbum(album);
			return [
				normalized.id,
				normalized.name,
				normalized.artistName,
				normalized.artistId,
				normalized.releaseDate ?? '',
				normalized.imageUrl ?? '',
				normalized.bio ?? '',
				(normalized.genres ?? [])
					.map((genre) => `${genre.id}:${genre.name}`)
					.sort((left, right) => left.localeCompare(right))
					.join(','),
			].join('|');
		})
		.join('\n');
}
