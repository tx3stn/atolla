import type { Genre } from './Genre';

export interface Track {
	albumId?: string;
	albumImageUrl?: string;
	albumName?: string;
	artistId?: string;
	artistName?: string;
	duration: number; // seconds
	genres?: Array<Genre>;
	id: string;
	name: string;
	productionYear?: number;
	releaseDate?: string;
	trackNumber?: number;
}
