import type { Album } from '../../models/Album';

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

	return true;
}

function normalizeAlbum(album: Album): Album {
	return {
		artistId: album.artistId,
		artistName: album.artistName,
		...(album.bio ? { bio: album.bio } : {}),
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
				return null;
			}
			normalizedAlbums.push(normalizeAlbum(entry));
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
			].join('|');
		})
		.join('\n');
}
