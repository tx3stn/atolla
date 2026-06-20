export function compareDatesAscending(left: string | undefined, right: string | undefined): number {
	const leftTime = parseDateTime(left);
	const rightTime = parseDateTime(right);

	if (leftTime == null && rightTime == null) return 0;
	if (leftTime == null) return 1;
	if (rightTime == null) return -1;

	return leftTime - rightTime;
}

export function compareDatesDescending(
	left: string | undefined,
	right: string | undefined,
): number {
	const leftTime = parseDateTime(left);
	const rightTime = parseDateTime(right);

	if (leftTime == null && rightTime == null) return 0;
	if (leftTime == null) return 1;
	if (rightTime == null) return -1;

	return rightTime - leftTime;
}

export function formatReleaseDate(value?: string | null): string | null {
	if (!value) return null;
	const trimmed = value.trim();
	if (trimmed.length === 0) return null;
	const tIndex = trimmed.indexOf('T');
	if (tIndex > 0) {
		return trimmed.slice(0, tIndex);
	}
	if (/^\d{4}-\d{2}-\d{2}/.test(trimmed) && trimmed.length > 10) {
		return trimmed.slice(0, 10);
	}
	return trimmed;
}

function parseDateTime(value: string | undefined): number | null {
	if (!value) return null;
	const time = Date.parse(value);
	return Number.isNaN(time) ? null : time;
}
