import type { Genre } from './Genre';

export interface Artist {
	bio?: string;
	genres?: Array<Genre>;
	id: string;
	imageUrl?: string;
	logoUrl?: string;
	name: string;
}
