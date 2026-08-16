import type { Album } from 'atolla_core/src/models/Album';
import type { Artist } from 'atolla_core/src/models/Artist';
import type { Genre } from 'atolla_core/src/models/Genre';
import type { Playlist } from 'atolla_core/src/models/Playlist';
import { InMemoryKeyValueStore, type KeyValueStore } from 'atolla_core/src/stores/KeyValueStore';

export const PINNED_ITEMS_KEY = 'pinned_items';

export type PinnedItemKind = 'album' | 'artist' | 'genre' | 'playlist';

export type PinnableItem =
	| { album: Album; kind: 'album' }
	| { artist: Artist; kind: 'artist' }
	| { genre: Genre; kind: 'genre' }
	| { kind: 'playlist'; playlist: Playlist };

export type PinnedItemEntry =
	| { album: Album; kind: 'album'; pinnedAt: number }
	| { artist: Artist; kind: 'artist'; pinnedAt: number }
	| { genre: Genre; kind: 'genre'; pinnedAt: number }
	| { kind: 'playlist'; pinnedAt: number; playlist: Playlist };

interface PersistedPinnedItems {
	items: Record<string, PinnedItemEntry>;
	version: 1;
}

export function pinnedItemId(item: PinnableItem): string {
	switch (item.kind) {
		case 'album':
			return item.album.id;
		case 'artist':
			return item.artist.id;
		case 'genre':
			return item.genre.id;
		case 'playlist':
			return item.playlist.id;
	}
}

function pinKey(kind: PinnedItemKind, id: string): string {
	return `${kind}:${id}`;
}

function isPersistedPinnedItems(value: unknown): value is PersistedPinnedItems {
	if (!value || typeof value !== 'object') return false;
	const candidate = value as Partial<PersistedPinnedItems>;
	return candidate.version === 1 && typeof candidate.items === 'object' && candidate.items !== null;
}

// on-device store for "pin to home": write-through observable cache, same shape as
// RecentlyPlayedStore/Preferences. in-memory is the source of truth for synchronous reads;
// pin/unpin mutate it, notify, then persist.
export class PinnedItemsStore {
	private items: Record<string, PinnedItemEntry> = {};
	private isLoaded = false;
	private loadPromise: Promise<void> | null = null;
	private readonly subscribers = new Set<() => void>();

	constructor(
		private readonly store: KeyValueStore = new InMemoryKeyValueStore(),
		private readonly now: () => number = Date.now,
	) {}

	ensureLoaded(): Promise<void> {
		if (this.isLoaded) return Promise.resolve();
		if (!this.loadPromise) {
			this.loadPromise = this.load();
		}
		return this.loadPromise;
	}

	getAll(): Array<PinnedItemEntry> {
		return Object.values(this.items).sort((a, b) => b.pinnedAt - a.pinnedAt);
	}

	isPinned(kind: PinnedItemKind, id: string): boolean {
		return pinKey(kind, id) in this.items;
	}

	async pin(item: PinnableItem): Promise<void> {
		await this.ensureLoaded();
		const key = pinKey(item.kind, pinnedItemId(item));
		this.items = { ...this.items, [key]: { ...item, pinnedAt: this.now() } };
		this.notify();
		await this.persist();
	}

	subscribe(callback: () => void): () => void {
		this.subscribers.add(callback);
		return () => {
			this.subscribers.delete(callback);
		};
	}

	async unpin(kind: PinnedItemKind, id: string): Promise<void> {
		await this.ensureLoaded();
		const key = pinKey(kind, id);
		if (!(key in this.items)) return;
		const { [key]: _removed, ...rest } = this.items;
		this.items = rest;
		this.notify();
		await this.persist();
	}

	private async load(): Promise<void> {
		try {
			const parsed = JSON.parse(await this.store.fetchString(PINNED_ITEMS_KEY)) as unknown;
			this.items = isPersistedPinnedItems(parsed) ? parsed.items : {};
		} catch {
			this.items = {};
		}
		this.isLoaded = true;
	}

	private notify(): void {
		for (const callback of this.subscribers) callback();
	}

	private persist(): Promise<void> {
		const blob: PersistedPinnedItems = { items: this.items, version: 1 };
		return this.store.storeString(PINNED_ITEMS_KEY, JSON.stringify(blob)).catch(() => {});
	}
}
