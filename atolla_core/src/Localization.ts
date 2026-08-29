import { overrideLocales } from 'valdi_core/src/LocalizableStrings';
import { Locale } from 'valdi_core/src/localization/Locale';
import type { LanguageCode } from './Language';

// overrideLocales works one Strings module at a time, so callers pass every module they render
export function applyLanguage(code: LanguageCode, ...stringModules: Array<unknown>): void {
	const locales = () => [new Locale(code, undefined)];

	for (const stringModule of stringModules) {
		overrideLocales(stringModule, locales);
	}
}
