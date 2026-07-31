import type { Artist } from '../../../models/Artist';
import { compareBySortKey } from '../../../utils/SortKey';

export function sortArtists(artists: Array<Artist>): Array<Artist> {
	return [...artists].sort(compareBySortKey);
}
