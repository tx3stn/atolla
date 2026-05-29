/**
 * Presentation data for a single row in a `CardDetailList`. Lives in models/
 * (not ui/) so Valdi-free services such as `OnThisDay` can produce these rows
 * without depending on the component that renders them.
 */
export interface CardDetailItem {
	artworkKey: string;
	id: string;
	kind: 'album' | 'artist' | 'playlist';
	lineOne: string;
	lineThree: string;
	lineTwo: string;
}
