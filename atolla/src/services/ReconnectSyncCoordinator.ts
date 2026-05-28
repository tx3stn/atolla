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

// Narrow structural interfaces (DI-friendly, testable without the concrete
// services or Valdi). Each captures only the methods the coordinator touches.
interface PlaylistCreateLike {
	flush(transport: Transport): Promise<Array<{ error: string; name: string }>>;
	getPending(): ReadonlyArray<unknown>;
	load(): Promise<void>;
}

interface PlaylistEditLike {
	flush(transport: Transport): Promise<Array<PlaylistEditError>>;
	getPendingCount(): Promise<number>;
}

interface ScrobbleLike {
	getPendingScrobbles(): Array<unknown>;
	onAppReady(): Promise<void>;
}

interface DownloadLike {
	onAppReady(): void;
}

export interface ReconnectSyncDeps {
	downloadService: DownloadLike;
	playlistCreateService: PlaylistCreateLike;
	playlistEditService: PlaylistEditLike;
	scrobbleService: ScrobbleLike;
}

// Orchestrates the deferred work that should run when the app reconnects
// (offline -> online): flushing queued playlist creates/edits, retrying pending
// scrobbles, and resuming downloads. Every step is individually guarded and the
// returned promise NEVER rejects, so a failing flush can never become an
// unhandled rejection that crashes the toggle. Progress is reported as each
// step settles so the UI can show what is happening.
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

		// Resume downloads in the background. Downloads are long-running content
		// fetches, not quick mutation sync, so they are kicked off but not part of
		// the progress denominator.
		try {
			downloadService.onAppReady();
		} catch {
			// best effort — never let a download resume failure surface
		}

		// Snapshot pending work up-front so progress has a stable denominator.
		const createBefore = await this.safeCount(async () => {
			await playlistCreateService.load();
			return playlistCreateService.getPending().length;
		});
		const editBefore = await this.safeCount(() => playlistEditService.getPendingCount());
		const scrobbleBefore = await this.safeCount(() => scrobbleService.getPendingScrobbles().length);

		const total = createBefore + editBefore + scrobbleBefore;

		let completed = 0;
		let failed = 0;
		let playlistEditErrors: Array<PlaylistEditError> = [];

		const emit = (status: SyncStatus): void => {
			onProgress({ completed, failed, status, total });
		};

		if (total === 0) {
			// Nothing to sync — leave the UI untouched (no banner).
			return { completed, failed, playlistEditErrors, status: 'done', total };
		}

		emit('syncing');

		try {
			const errors = await playlistCreateService.flush(transport);
			failed += errors.length;
			completed += Math.max(0, createBefore - errors.length);
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

		// Scrobbles retry via the service's own delivery closure (which reads the
		// now-live transport). Undelivered ones stay queued for a later retry; for
		// this window we count them as not-yet-synced.
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
