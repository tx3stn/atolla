import type { Album } from '../models/Album';
import type { Genre } from '../models/Genre';
import type { Transport } from '../transports/Transport';

// Owns the "Recently Added" albums shown on home: a small persisted cache so the
// section paints instantly on launch, plus a transport refresh that re-fills it.
// Mirrors OnThisDayService — the view keeps only its generation-guarded setState.

const RECENTLY_ADDED_ALBUMS_CACHE_KEY = 'recently_added_v1';

export interface RecentlyAddedStore {
	fetchString(key: string): Promise<string>;
	storeString(key: string, value: string): Promise<void>;
}

export type RecentlyAddedTransport = Pick<Transport, 'getRecentlyAddedAlbums'>;

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

function parseRecentlyAddedCache(raw: string): Array<Album> | null {
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

function serializeRecentlyAddedCache(albums: Array<Album>): string {
	return JSON.stringify({
		albums: albums.map((album) => normalizeAlbum(album)),
		version: 1,
	});
}

export class RecentlyAddedService {
	constructor(private readonly store: RecentlyAddedStore) {}

	/** Parsed cached albums for the render path — [] when nothing is cached. */
	async loadCached(): Promise<Array<Album>> {
		try {
			const cached = parseRecentlyAddedCache(
				await this.store.fetchString(RECENTLY_ADDED_ALBUMS_CACHE_KEY),
			);
			return cached ?? [];
		} catch {
			return [];
		}
	}

	/** Fetch the latest recently-added albums, persist them, and return them. */
	async refresh(transport: RecentlyAddedTransport, limit: number): Promise<Array<Album>> {
		const albums = await transport.getRecentlyAddedAlbums(limit);
		await this.persist(albums);
		return albums;
	}

	private persist(albums: Array<Album>): Promise<void> {
		return this.store
			.storeString(RECENTLY_ADDED_ALBUMS_CACHE_KEY, serializeRecentlyAddedCache(albums))
			.catch(() => {});
	}
}
