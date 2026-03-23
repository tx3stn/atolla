export interface Track {
	albumId?: string;
	albumImageUrl?: string;
	albumName?: string;
	artistId?: string;
	artistName?: string;
	duration: number; // seconds
	id: string;
	name: string;
	trackNumber?: number;
}
