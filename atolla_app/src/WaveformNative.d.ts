/**
 * @ExportModule
 */

// @ExportFunction
// Delete the stored waveforms for every user on this device.
export function clearAtollaWaveforms(): void;

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
// Decode the audio at audioPath and store its waveform under trackId.
// Calls onComplete with true once the waveform is stored, or false if
// decoding or writing failed.
export function generateAtollaWaveformAsync(
	trackId: string,
	audioPath: string,
	onComplete: (ok: boolean) => void,
): void;

// @ExportFunction
// Calls onComplete with the number of stored waveforms.
export function getAtollaWaveformCountAsync(onComplete: (count: number) => void): void;

// @ExportFunction
// Return whether a waveform is stored for trackId. Checks the file
// synchronously.
export function hasAtollaWaveform(trackId: string): boolean;

// @ExportFunction
// TODO(waveform-migration): remove once it's been long enough that all uses of old waveform cache have been replaced
// Write a waveform file for each ready record in recordsJson, the JSON from
// the old waveform_records store. Calls onComplete with the number of
// waveforms written.
export function migrateAtollaWaveformsAsync(
	recordsJson: string,
	onComplete: (migrated: number) => void,
): void;

// @ExportFunction
// Render the stored waveform for trackId as a width by height mask PNG.
// Calls onComplete with the local file URL of the PNG, or an empty string
// if no waveform is stored or rendering failed.
export function renderAtollaWaveformAsync(
	trackId: string,
	width: number,
	height: number,
	onComplete: (outputUrl: string) => void,
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
