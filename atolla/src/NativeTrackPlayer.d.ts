/**
 * @ExportModule
 */

// @ExportFunction
export function setAtollaNativeTrackPlayerSource(sourceUrl: string): void;

// @ExportFunction
export function setAtollaNativeTrackPlayerPlaying(isPlaying: boolean): void;

// @ExportFunction
export function seekAtollaNativeTrackPlayerTo(seconds: number): void;

// @ExportFunction
export function getAtollaNativeTrackPlayerPositionSeconds(): number;

// @ExportFunction
export function getAtollaNativeTrackPlayerDurationSeconds(): number;

// @ExportFunction
export function getAtollaNativeTrackPlayerState(): string;

// @ExportFunction
export function getAtollaNativeTrackPlayerLastError(): string;

// @ExportFunction
export function resetAtollaNativeTrackPlayer(): void;
