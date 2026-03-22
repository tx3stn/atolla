import { ErrorConst } from './Const';

export const PaletteGenerationErrors = {
	CACHE_MISS: new ErrorConst('palette_cache_miss', 'image is not present in cache'),
	EXTRACTION_FAILED: new ErrorConst(
		'palette_extract_failed',
		'palette extraction did not produce a palette',
	),
	TIMEOUT: new ErrorConst('palette_timeout', 'palette generation timed out'),
	UNKNOWN: new ErrorConst('palette_unknown', 'unknown palette generation failure'),
} as const;
