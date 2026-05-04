import type { Transport } from '../transports/Transport';

export type PlaylistOperation =
	| { playlistId: string; toIndex: number; trackId: string; type: 'move' }
	| { playlistId: string; trackId: string; type: 'remove' };

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
			const parsed = JSON.parse(raw);
			if (Array.isArray(parsed)) {
				this.pendingOps = parsed as Array<PlaylistOperation>;
			}
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

	async flush(transport: Transport): Promise<void> {
		await this.operationChain;
		await this.load();

		if (this.pendingOps.length === 0) return;

		const ops = this.pendingOps;
		const failed: Array<PlaylistOperation> = [];

		for (const op of ops) {
			try {
				if (op.type === 'move' && transport.movePlaylistTrack) {
					await transport.movePlaylistTrack(op.playlistId, op.trackId, op.toIndex);
				} else if (op.type === 'remove' && transport.removePlaylistTrack) {
					await transport.removePlaylistTrack(op.playlistId, op.trackId);
				}
			} catch {
				failed.push(op);
			}
		}

		this.pendingOps = failed;
		await this.persist();
	}

	private async persist(): Promise<void> {
		await this.store.storeString(pendingOpsKey, JSON.stringify(this.pendingOps));
	}
}
