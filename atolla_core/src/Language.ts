export const LANGUAGE_OPTIONS = [
	{ code: 'en', flag: '🇬🇧', name: 'ENGLISH' },
	{ code: 'fr', flag: '🇫🇷', name: 'FRANÇAIS' },
] as const;
export type LanguageCode = (typeof LANGUAGE_OPTIONS)[number]['code'];
export const DEFAULT_LANGUAGE: LanguageCode = 'en';
