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

function parseDateTime(value: string | undefined): number | null {
	if (!value) return null;
	const time = Date.parse(value);
	return Number.isNaN(time) ? null : time;
}
