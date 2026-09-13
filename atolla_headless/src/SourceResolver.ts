import { mediaDir, type PlayerConfig } from './PlayerConfig';

// Matches audio_player.zig's max_track_id_bytes, so an id this accepts is one the engine can hold.
const MAX_TRACK_ID_LENGTH = 128;

const TRACK_ID = /^[A-Za-z0-9_-]+$/;

export function isMediaTrackId(trackId: string): boolean {
	return trackId.length > 0 && trackId.length <= MAX_TRACK_ID_LENGTH && TRACK_ID.test(trackId);
}

// Composed from a validated id rather than joined with one: an id of `../../secrets/controllers`
// would otherwise read, and at step 11 write, outside the media directory.
export function resolveLocalSource(config: PlayerConfig, trackId: string): string | null {
	if (!isMediaTrackId(trackId)) {
		return null;
	}

	return `${mediaDir(config)}/${trackId}`;
}
