/**
 * @ExportModule
 */

// @ExportFunction
export function cacheAtollaTrackFromUrl(trackId: string, url: string): string;

// @ExportFunction
export function getAtollaCachedTrackFileUrl(trackId: string): string;

// @ExportFunction
export function getAtollaTrackCacheEntryCount(): number;

// @ExportFunction
export function clearAtollaTrackCache(): void;

// @ExportFunction
export function setAtollaTrackCacheMaxTracks(maxTracks: number): void;
