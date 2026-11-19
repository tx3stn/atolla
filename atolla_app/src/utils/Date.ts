import Strings from 'atolla_app/src/Strings';
import type { LanguageCode } from 'atolla_core/src/Language';

const MONTH_NAMES: Array<() => string> = [
	() => Strings.monthJanuary(),
	() => Strings.monthFebruary(),
	() => Strings.monthMarch(),
	() => Strings.monthApril(),
	() => Strings.monthMay(),
	() => Strings.monthJune(),
	() => Strings.monthJuly(),
	() => Strings.monthAugust(),
	() => Strings.monthSeptember(),
	() => Strings.monthOctober(),
	() => Strings.monthNovember(),
	() => Strings.monthDecember(),
];

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

export function formatDayAndMonth(value: string, language: LanguageCode): string {
	const date = formatReleaseDate(value) ?? '';
	const parts = /^\d{4}-(\d{2})-(\d{2})$/.exec(date);
	const monthName = parts ? MONTH_NAMES[Number(parts[1]) - 1] : undefined;
	if (!parts || !monthName) {
		return date;
	}

	return Strings.dateDayMonth(ordinalDay(Number(parts[2]), language), monthName());
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

function englishOrdinalSuffix(day: number): string {
	if (day >= 11 && day <= 13) {
		return 'th';
	}
	switch (day % 10) {
		case 1:
			return 'st';
		case 2:
			return 'nd';
		case 3:
			return 'rd';
		default:
			return 'th';
	}
}

function ordinalDay(day: number, language: LanguageCode): string {
	switch (language) {
		case 'en':
			return `${day}${englishOrdinalSuffix(day)}`;
		case 'fr':
			return day === 1 ? '1er' : String(day);
	}
}

function parseDateTime(value: string | undefined): number | null {
	if (!value) return null;
	const time = Date.parse(value);
	return Number.isNaN(time) ? null : time;
}
