import type { Playlist } from '../models/Playlist';
import type { Transport } from '../transports/Transport';
import type { PlaylistEditError } from './PlaylistEditService';

export type SyncStatus = 'syncing' | 'done' | 'partial';

export interface SyncProgress {
	completed: number;
	failed: number;
	status: SyncStatus;
	total: number;
}

export interface SyncResult extends SyncProgress {
	playlistEditErrors: Array<PlaylistEditError>;
}

// narrow structural interfaces (DI-friendly, testable without the real services);
// each captures only the methods the coordinator touches
interface PlaylistCreateLike {
	flush(transport: Transport): Promise<{
		errors: Array<{ error: string; name: string }>;
		idMappings: Array<{
			imageUrl?: string;
			initialTrackId: string;
			localId: string;
			name: string;
			serverId: string;
		}>;
	}>;
	getPending(): ReadonlyArray<unknown>;
	load(): Promise<void>;
}

interface PlaylistEditLike {
	collectAddedTrackIds(
		localIds: ReadonlyArray<string>,
	): Promise<Map<string, ReadonlyArray<string>>>;
	flush(transport: Transport): Promise<Array<PlaylistEditError>>;
	getPendingCount(): Promise<number>;
	remapPlaylistIds(mapping: ReadonlyArray<{ localId: string; serverId: string }>): void;
}

interface DownloadLike {
	onAppReady(): void;
	registerSyncedPlaylist(playlist: Playlist, trackIds: ReadonlyArray<string>): void;
}

interface ScrobbleLike {
	getPendingCount(): Promise<number>;
	getPendingScrobbles(): Array<unknown>;
	onAppReady(): Promise<void>;
}

export interface ReconnectSyncDeps {
	downloadService: DownloadLike;
	playlistCreateService: PlaylistCreateLike;
	playlistEditService: PlaylistEditLike;
	scrobbleService: ScrobbleLike;
}

// runs deferred work on reconnect (offline -> online): flush queued playlist
// creates/edits, retry pending scrobbles, resume downloads. each step is guarded
// and the returned promise never rejects, so a failing flush can't crash the toggle
export class ReconnectSyncCoordinator {
	private readonly deps: ReconnectSyncDeps;

	constructor(deps: ReconnectSyncDeps) {
		this.deps = deps;
	}

	async run(
		transport: Transport,
		onProgress: (progress: SyncProgress) => void,
	): Promise<SyncResult> {
		const { playlistCreateService, playlistEditService, scrobbleService, downloadService } =
			this.deps;

		// resume downloads in the background: long-running fetches, so kicked off
		// but not counted in the progress denominator
		try {
			downloadService.onAppReady();
		} catch {
			// best effort: never let a download resume failure surface
		}

		// snapshot pending work up-front so progress has a stable denominator
		const createBefore = await this.safeCount(async () => {
			await playlistCreateService.load();
			return playlistCreateService.getPending().length;
		});
		const editBefore = await this.safeCount(() => playlistEditService.getPendingCount());
		const scrobbleBefore = await this.safeCount(() => scrobbleService.getPendingCount());

		const total = createBefore + editBefore + scrobbleBefore;

		let completed = 0;
		let failed = 0;
		let playlistEditErrors: Array<PlaylistEditError> = [];

		const emit = (status: SyncStatus): void => {
			onProgress({ completed, failed, status, total });
		};

		if (total === 0) {
			// nothing to sync: leave the UI untouched (no banner)
			return { completed, failed, playlistEditErrors, status: 'done', total };
		}

		emit('syncing');

		try {
			const { errors, idMappings } = await playlistCreateService.flush(transport);
			failed += errors.length;
			completed += Math.max(0, createBefore - errors.length);
			if (idMappings.length > 0) {
				const localIds = idMappings.map(({ localId }) => localId);
				const addedByLocalId = await playlistEditService.collectAddedTrackIds(localIds);
				playlistEditService.remapPlaylistIds(
					idMappings.map(({ localId, serverId }) => ({ localId, serverId })),
				);
				for (const { imageUrl, initialTrackId, localId, name, serverId } of idMappings) {
					const added = addedByLocalId.get(localId) ?? [];
					const allTrackIds = initialTrackId ? [initialTrackId, ...added] : [...added];
					downloadService.registerSyncedPlaylist({ id: serverId, imageUrl, name }, allTrackIds);
				}
			}
		} catch {
			failed += createBefore;
		}
		emit('syncing');

		try {
			playlistEditErrors = await playlistEditService.flush(transport);
			failed += playlistEditErrors.length;
			completed += Math.max(0, editBefore - playlistEditErrors.length);
		} catch {
			failed += editBefore;
		}
		emit('syncing');

		// scrobbles retry via the service's own delivery closure; undelivered ones
		// stay queued and count as not-yet-synced for this window
		try {
			await scrobbleService.onAppReady();
			const after = scrobbleService.getPendingScrobbles().length;
			const delivered = Math.max(0, scrobbleBefore - after);
			completed += delivered;
			failed += Math.max(0, scrobbleBefore - delivered);
		} catch {
			failed += scrobbleBefore;
		}

		const status: SyncStatus = failed > 0 ? 'partial' : 'done';
		const result: SyncResult = { completed, failed, playlistEditErrors, status, total };
		onProgress({ completed, failed, status, total });
		return result;
	}

	private async safeCount(read: () => number | Promise<number>): Promise<number> {
		try {
			return await read();
		} catch {
			return 0;
		}
	}
}
