import type { JellyfinLyricDto } from '../../../atolla_jellyfin/src/models/Types';

const SECOND = 10_000_000;

const syncedLineSeconds = [4, 9, 14, 16, 21, 27, 30, 34, 39, 47, 52, 58, 66];

export const mockJellyfinLyrics: Record<string, JellyfinLyricDto> = {
	'track-1': {
		Lyrics: syncedLineSeconds.map((second, index) => ({
			Start: second * SECOND,
			Text: index === 2 || index === 5 ? '' : `synced line ${index + 1} at ${second}s`,
		})),
		Metadata: { IsSynced: true },
	},
	'track-81': {
		Lyrics: [
			{ Text: 'unsynced line 1' },
			{ Text: 'unsynced line 2' },
			{ Text: '' },
			{ Text: 'unsynced line 4' },
			{ Text: 'unsynced line 5' },
			{ Text: 'unsynced line 6' },
		],
		Metadata: { IsSynced: false },
	},
};

export const mockTracksWithMissingLyrics = new Set(['track-82']);
