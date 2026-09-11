import type { Genre } from './Genre';

export interface Album {
	addedDate?: string;
	artistId: string;
	artistName: string;
	bio?: string;
	genres?: Array<Genre>;
	id: string;
	imageUrl?: string;
	name: string;
	releaseDate?: string;
	sortName?: string;
}

// minimal structural check used when validating persisted/untrusted album payloads, as isTrack does
export function isAlbum(value: unknown): value is Album {
	if (!value || typeof value !== 'object') {
		return false;
	}

	const candidate = value as Partial<Album>;
	return (
		typeof candidate.artistId === 'string' &&
		typeof candidate.artistName === 'string' &&
		typeof candidate.id === 'string' &&
		typeof candidate.name === 'string'
	);
}
