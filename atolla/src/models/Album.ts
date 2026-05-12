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
}
