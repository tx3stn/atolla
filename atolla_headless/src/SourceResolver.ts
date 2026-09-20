import type { Track } from 'atolla_core/src/models/Track';
import type { StoreFiles } from './FileKeyValueStore';
import type { MediaServerTransports } from './MediaServerTransports';
import { mediaDir, type PlayerConfig } from './PlayerConfig';
import type { QueueOwner } from './QueueOwner';

// Matches audio_player.zig's max_track_id_bytes, so an id this accepts is one the engine can hold.
const MAX_TRACK_ID_LENGTH = 128;

const TRACK_ID = /^[A-Za-z0-9_-]+$/;

export interface ResolvedSource {
	authHeader: string;
	source: string;
}

export interface SourceResolverDeps {
	config: PlayerConfig;
	files: StoreFiles;
	queueOwner: QueueOwner;
	transports: MediaServerTransports;
}

export function isMediaTrackId(trackId: string): boolean {
	return trackId.length > 0 && trackId.length <= MAX_TRACK_ID_LENGTH && TRACK_ID.test(trackId);
}

// A queue nobody owns has only local files behind it, so the path is composed without a stat and a
// missing one fails at the engine, as it did before the daemon could reach a media server at all.
// An owner means a credential is expected, so the stat runs: handing over a path that is not there
// while the credential is still on its way spends the track.
export function makeSourceResolver(
	deps: SourceResolverDeps,
): (track: Track) => ResolvedSource | null {
	return (track) => {
		const local = resolveLocalSource(deps.config, track.id);
		const owner = deps.queueOwner.get();

		if (owner === null) {
			return local === null ? null : { authHeader: '', source: local };
		}

		if (local !== null && deps.files.existsSync(local)) {
			return { authHeader: '', source: local };
		}

		const access = deps.transports.forUser(owner);
		if (access === null) {
			return null;
		}

		const url = access.transport.getTrackCacheUrl(track.id);

		return url === null ? null : { authHeader: access.authHeader, source: url };
	};
}

// Composed from a validated id rather than joined with one: an id of `../../secrets/controllers`
// would otherwise read, and at step 11 write, outside the media directory.
export function resolveLocalSource(config: PlayerConfig, trackId: string): string | null {
	if (!isMediaTrackId(trackId)) {
		return null;
	}

	return `${mediaDir(config)}/${trackId}`;
}
