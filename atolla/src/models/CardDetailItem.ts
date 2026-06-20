export interface CardDetailItem {
	artworkKey: string;
	id: string;
	kind: 'album' | 'artist' | 'playlist';
	lineOne: string;
	lineThree: string;
	lineTwo: string;
}
