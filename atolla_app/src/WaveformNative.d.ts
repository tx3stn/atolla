/**
 * @ExportModule
 */

// @ExportFunction
// Extract a 100-point normalised amplitude array from the audio at audioPath.
// Calls onComplete with a base64-encoded float32[100] buffer, or an empty
// string if extraction failed.
export function generateAtollaWaveformAmpsAsync(
	trackId: string,
	audioPath: string,
	onComplete: (ampsBase64: string) => void,
): void;

// @ExportFunction
// Render a waveform mask PNG from a base64-encoded float32 amplitude array.
// Calls onComplete with the local file URL of the written PNG, or an empty
// string if rendering failed.
export function renderAtollaWaveformFromAmpsAsync(
	ampsBase64: string,
	width: number,
	height: number,
	onComplete: (outputUrl: string) => void,
): void;
