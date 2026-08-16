import type { Artist } from 'atolla_core/src/models/Artist';
import { compareBySortKey } from 'atolla_core/src/utils/SortKey';

export function sortArtists(artists: Array<Artist>): Array<Artist> {
	return [...artists].sort(compareBySortKey);
}
