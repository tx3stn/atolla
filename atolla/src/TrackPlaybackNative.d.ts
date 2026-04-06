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

// @ExportFunction
export function updateAtollaTrackPlaybackNotification(
	trackName: string,
	artistName: string,
	albumName: string,
	artworkUrl: string,
	isPlaying: boolean,
	positionSeconds: number,
	durationSeconds: number,
	hasPrevious: boolean,
	hasNext: boolean,
): void;

// @ExportFunction
export function clearAtollaTrackPlaybackNotification(): void;

// @ExportFunction
export function consumeAtollaTrackPlaybackNotificationAction(): string;

// @ExportFunction
export function ensureAtollaTrackPlaybackNotificationPermission(): boolean;
