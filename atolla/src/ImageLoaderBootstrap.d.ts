/**
 * @ExportModule
 */

// @ExportFunction
export function ensureAtollaImageLoaderBootstrap(): void;

// @ExportFunction
export function getAtollaImageLoaderCacheEntryCount(): number;

// @ExportFunction
export function getAtollaImageLoaderCacheByteSize(): number;

// @ExportFunction
export function clearAtollaNativeCacheCategories(categories: Array<string>): void;

// @ExportFunction
export function extractAtollaPaletteFromCache(url: string, category: string): string;
