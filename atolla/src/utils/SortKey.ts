// every alphabetical comparison and letter bucket in the app goes through sortKey, so a
// list stays a well-defined total order even while only some of its items carry the
// server's key. comparing stored keys against locally derived ones ad-hoc would not.
export interface Sortable {
	name: string;
	sortName?: string;
}

export function compareBySortKey(left: Sortable, right: Sortable): number {
	const byKey = compareStrings(sortKey(left), sortKey(right));
	if (byKey !== 0) {
		return byKey;
	}

	return compareStrings(left.name.trim(), right.name.trim());
}

export function matchesLetterFilter(item: Sortable, letter: string): boolean {
	const key = sortKey(item);
	if (letter === '0') {
		return !/^[a-z]/.test(key);
	}

	return key.startsWith(letter.toLowerCase());
}

// jellyfin's SortName is already lowercased with leading articles stripped. the fallback
// reproduces that for items downloaded before we started asking for it — note that
// toLowerCase is a no-op above ascii on device, which is the bug this key works around.
export function sortKey(item: Sortable): string {
	const serverKey = item.sortName?.trim();
	if (serverKey) {
		return serverKey.toLowerCase();
	}

	return item.name
		.trim()
		.replace(/^the\s+/i, '')
		.toLowerCase();
}

function compareStrings(left: string, right: string): number {
	if (left < right) {
		return -1;
	}
	if (left > right) {
		return 1;
	}

	return 0;
}
