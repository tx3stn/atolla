export interface Track {
	albumId?: string;
	albumImageUrl?: string;
	albumName?: string;
	artistId?: string;
	artistName?: string;
	duration: number; // seconds
	id: string;
	name: string;
	productionYear?: number;
	releaseDate?: string;
	trackNumber?: number;
}
