import type { Playlist } from '../models/Playlist';
import type { Transport } from '../transports/Transport';

type PendingPlaylistCreate = {
	localId: string;
	name: string;
	trackId: string;
};

export interface PlaylistCreateStore {
	fetchString(key: string): Promise<string>;
	storeString(key: string, value: string): Promise<void>;
}

const pendingKey = 'pending_playlist_creates';

export class PlaylistCreateService {
	private pending: Array<PendingPlaylistCreate> = [];
	private readonly store: PlaylistCreateStore;
	private isLoaded = false;

	constructor(store: PlaylistCreateStore) {
		this.store = store;
	}

	async load(): Promise<void> {
		if (this.isLoaded) return;
		this.isLoaded = true;
		try {
			const raw = await this.store.fetchString(pendingKey);
			const parsed: unknown = JSON.parse(raw);
			const stored = Array.isArray(parsed) ? parsed.filter(isPendingPlaylistCreate) : [];
			for (const op of stored) {
				if (!this.pending.some((p) => p.localId === op.localId)) {
					this.pending.push(op);
				}
			}
		} catch {
			// storage empty or invalid — keep whatever is in memory
		}
		await this.persist();
	}

	enqueue(name: string, trackId: string): Playlist {
		const localId = `local-playlist-${Date.now()}`;
		this.pending.push({ localId, name, trackId });
		if (this.isLoaded) void this.persist();
		return { id: localId, name };
	}

	getPending(): ReadonlyArray<PendingPlaylistCreate> {
		return this.pending;
	}

	async flush(transport: Transport): Promise<{
		errors: Array<{ error: string; name: string }>;
		idMappings: Array<{
			imageUrl?: string;
			initialTrackId: string;
			localId: string;
			name: string;
			serverId: string;
		}>;
	}> {
		await this.load();
		if (this.pending.length === 0) return { errors: [], idMappings: [] };

		const ops = [...this.pending];
		const errors: Array<{ error: string; name: string }> = [];
		const idMappings: Array<{
			imageUrl: string | undefined;
			initialTrackId: string;
			localId: string;
			name: string;
			serverId: string;
		}> = [];

		for (const op of ops) {
			try {
				const created = await transport.createPlaylist(op.name, op.trackId);
				idMappings.push({
					imageUrl: created.imageUrl,
					initialTrackId: op.trackId,
					localId: op.localId,
					name: op.name,
					serverId: created.id,
				});
				const idx = this.pending.findIndex((p) => p.localId === op.localId);
				if (idx >= 0) this.pending.splice(idx, 1);
			} catch (e: unknown) {
				errors.push({ error: extractErrorMessage(e), name: op.name });
			}
		}

		await this.persist();
		return { errors, idMappings };
	}

	private async persist(): Promise<void> {
		await this.store.storeString(pendingKey, JSON.stringify(this.pending));
	}
}

function extractErrorMessage(e: unknown): string {
	if (e != null && typeof e === 'object' && 'message' in e && typeof e.message === 'string') {
		return e.message;
	}
	return 'Unknown error';
}

function isPendingPlaylistCreate(value: unknown): value is PendingPlaylistCreate {
	if (!value || typeof value !== 'object') return false;
	const c = value as Partial<PendingPlaylistCreate>;
	return (
		typeof c.localId === 'string' && typeof c.name === 'string' && typeof c.trackId === 'string'
	);
}
