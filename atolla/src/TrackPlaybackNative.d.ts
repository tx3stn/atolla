/**
 * @ExportModule
 */

// @ExportFunction
export function cacheAtollaTrackFromUrl(trackId: string, url: string): string;

// @ExportFunction
export function cacheAtollaTrackFromUrlAsync(
	trackId: string,
	url: string,
	onComplete: (source: string) => void,
): void;

// @ExportFunction
export function getAtollaCachedTrackFileUrl(trackId: string): string;

// @ExportFunction
export function getAtollaTrackCacheEntryCount(): number;

// @ExportFunction
export function clearAtollaTrackCache(): void;

// @ExportFunction
export function setAtollaTrackCacheMaxTracks(maxTracks: number): void;

// @ExportFunction
export function cacheAtollaDownloadedTrackFromUrlAsync(
	trackId: string,
	url: string,
	onComplete: (source: string) => void,
): void;

// @ExportFunction
export function getAtollaDownloadedTrackFileUrl(trackId: string): string;

// @ExportFunction
export function removeAtollaDownloadedTrack(trackId: string): void;

// @ExportFunction
export function getAtollaDownloadedCacheTotalSizeBytes(): number;

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

// @ExportFunction
export function getAtollaDeviceUserScopeKey(): string;
