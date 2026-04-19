import type { Genre } from './Genre';

export interface Artist {
	bio?: string;
	dateAdded?: string;
	genres?: Array<Genre>;
	id: string;
	imageUrl?: string;
	logoUrl?: string;
	name: string;
}
