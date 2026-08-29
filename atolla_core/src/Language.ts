import { overrideLocales } from 'valdi_core/src/LocalizableStrings';
import { Locale } from 'valdi_core/src/localization/Locale';

export const LANGUAGE_OPTIONS = [
	{ code: 'en', flag: '🇬🇧', name: 'ENGLISH' },
	{ code: 'fr', flag: '🇫🇷', name: 'FRANÇAIS' },
] as const;
export type LanguageCode = (typeof LANGUAGE_OPTIONS)[number]['code'];
export const DEFAULT_LANGUAGE: LanguageCode = 'en';

// overrideLocales works one Strings module at a time, so callers pass every module they render
export function applyLanguage(code: LanguageCode, ...stringModules: Array<unknown>): void {
	const locales = () => [new Locale(code, undefined)];

	for (const stringModule of stringModules) {
		overrideLocales(stringModule, locales);
	}
}
