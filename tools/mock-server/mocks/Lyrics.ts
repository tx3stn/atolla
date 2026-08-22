import type { JellyfinLyricDto } from '../../../atolla_jellyfin/src/models/Types';

const SECOND = 10_000_000;

// track-1 runs 79s, so the timings are packed tight. the gap between verses is wider than the gap
// between lines within one, so phase 4's active-line boundaries are not all the same width
const syncedLineSeconds = [
	3, 5, 7, 9, 12, 14, 16, 18, 21, 23, 25, 27, 30, 32, 34, 36, 39, 41, 43, 45, 48, 50, 52, 54, 57,
	59, 61, 63, 66, 68, 70, 72, 75, 77,
];

const unsyncedLineCount = 34;

// one over-long line per fixture, so wrapping and the panel's side padding are visible without
// having to hunt for a line that happens to be long enough
const wrappingLineIndex = 16;

function isVerseBreak(index: number): boolean {
	return index % 6 === 5;
}

function syncedLineText(index: number, second: number): string {
	if (isVerseBreak(index)) {
		return '';
	}
	if (index === wrappingLineIndex) {
		return `synced line ${index + 1} at ${second}s is deliberately long so it wraps across several rows and the side padding is easy to check`;
	}
	return `synced line ${index + 1} at ${second}s`;
}

function unsyncedLineText(index: number): string {
	if (isVerseBreak(index)) {
		return '';
	}
	if (index === wrappingLineIndex) {
		return `unsynced line ${index + 1} is deliberately long so it wraps across several rows and the side padding is easy to check`;
	}
	return `unsynced line ${index + 1}`;
}

export const mockJellyfinLyrics: Record<string, JellyfinLyricDto> = {
	'track-1': {
		Lyrics: syncedLineSeconds.map((second, index) => ({
			Start: second * SECOND,
			Text: syncedLineText(index, second),
		})),
		Metadata: { IsSynced: true },
	},
	'track-81': {
		Lyrics: Array.from({ length: unsyncedLineCount }, (_, index) => ({
			Text: unsyncedLineText(index),
		})),
		Metadata: { IsSynced: false },
	},
};

export const mockTracksWithMissingLyrics = new Set(['track-82']);
