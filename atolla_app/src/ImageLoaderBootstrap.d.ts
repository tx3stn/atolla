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
export function getAtollaImageLoaderDiskCacheEntryCount(): number;

// @ExportFunction
export function getAtollaImageLoaderDiskCacheByteSize(): number;

// @ExportFunction
export function getAtollaImageLoaderDiskCacheCategoryCountsJson(): string;

// @ExportFunction
export function requestAtollaImageLoaderDiskCacheStats(
	callback: (diskCount: number, diskBytes: number, categoryCountsJson: string) => void,
): void;

// @ExportFunction
export function setAtollaImageLoaderDiskCacheMaxBytes(bytes: number): void;

// @ExportFunction
export function clearAtollaNativeCacheCategories(categories: Array<string>): void;

// @ExportFunction
export function extractAtollaPaletteFromCache(identity: string, category: string): string;

// file:// url for already-cached bytes at this address, or "" when nothing is cached. lets callers
// that only hold an entity id discover what is available without a fetch
// @ExportFunction
export function resolveAtollaCachedImage(category: string, identity: string): string;

// @ExportFunction
export function preloadAtollaImages(sources: Array<string>): void;

// @ExportFunction
export function setAtollaImageCachedObserver(
	callback: (identity: string, category: string) => void,
): void;

// @ExportFunction
export function setAtollaImageLoaderAuthToken(token: string): void;
