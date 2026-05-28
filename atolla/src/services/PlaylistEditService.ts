import type { Transport } from '../transports/Transport';

function extractErrorMessage(e: unknown): string {
	if (e != null && typeof e === 'object' && 'message' in e && typeof e.message === 'string') {
		return e.message;
	}
	return 'Unknown error';
}

export type PlaylistOperation =
	| { playlistId: string; playlistName: string; toIndex: number; trackId: string; type: 'move' }
	| { playlistId: string; playlistName: string; trackId: string; type: 'remove' };

export interface PlaylistEditError {
	error: string;
	playlistName: string;
	type: string;
}

export interface PlaylistEditStore {
	fetchString(key: string): Promise<string>;
	storeString(key: string, value: string): Promise<void>;
}

const pendingOpsKey = 'pending_playlist_ops';

export class PlaylistEditService {
	private pendingOps: Array<PlaylistOperation> = [];
	private readonly store: PlaylistEditStore;
	private isLoaded = false;
	private operationChain: Promise<void> = Promise.resolve();

	constructor(store: PlaylistEditStore) {
		this.store = store;
	}

	async load(): Promise<void> {
		if (this.isLoaded) return;
		try {
			const raw = await this.store.fetchString(pendingOpsKey);
			const parsed: unknown = JSON.parse(raw);
			this.pendingOps = Array.isArray(parsed) ? parsed.filter(isPlaylistOperation) : [];
		} catch {
			this.pendingOps = [];
		}
		this.isLoaded = true;
	}

	enqueue(op: PlaylistOperation): void {
		this.operationChain = this.operationChain.then(async () => {
			await this.load();
			this.pendingOps = [...this.pendingOps, op];
			await this.persist();
		});
	}

	async execute(op: PlaylistOperation, transport: Transport): Promise<PlaylistEditError | null> {
		const supportsOp =
			(op.type === 'move' && transport.movePlaylistTrack != null) ||
			(op.type === 'remove' && transport.removePlaylistTrack != null);

		if (!supportsOp) {
			this.enqueue(op);
			return null;
		}

		try {
			if (op.type === 'move') {
				await transport.movePlaylistTrack?.(op.playlistId, op.trackId, op.toIndex);
			} else if (op.type === 'remove') {
				await transport.removePlaylistTrack?.(op.playlistId, op.trackId);
			}
			return null;
		} catch (e) {
			return { error: extractErrorMessage(e), playlistName: op.playlistName, type: op.type };
		}
	}

	async getPendingCount(): Promise<number> {
		await this.operationChain;
		await this.load();
		return this.pendingOps.length;
	}

	async flush(transport: Transport): Promise<Array<PlaylistEditError>> {
		await this.operationChain;
		await this.load();

		if (this.pendingOps.length === 0) return [];

		const ops = this.pendingOps;
		const errors: Array<PlaylistEditError> = [];

		for (const op of ops) {
			try {
				if (op.type === 'move' && transport.movePlaylistTrack) {
					await transport.movePlaylistTrack(op.playlistId, op.trackId, op.toIndex);
				} else if (op.type === 'remove' && transport.removePlaylistTrack) {
					await transport.removePlaylistTrack(op.playlistId, op.trackId);
				}
			} catch (e) {
				errors.push({
					error: extractErrorMessage(e),
					playlistName: op.playlistName,
					type: op.type,
				});
			}
		}

		this.pendingOps = [];
		await this.persist();
		return errors;
	}

	private async persist(): Promise<void> {
		await this.store.storeString(pendingOpsKey, JSON.stringify(this.pendingOps));
	}
}

function isPlaylistOperation(value: unknown): value is PlaylistOperation {
	if (!value || typeof value !== 'object') {
		return false;
	}
	const candidate = value as Partial<PlaylistOperation>;
	if (
		typeof candidate.playlistId !== 'string' ||
		typeof candidate.trackId !== 'string' ||
		typeof candidate.playlistName !== 'string'
	) {
		return false;
	}
	if (candidate.type === 'move') {
		return typeof (candidate as { toIndex?: unknown }).toIndex === 'number';
	}
	return candidate.type === 'remove';
}
