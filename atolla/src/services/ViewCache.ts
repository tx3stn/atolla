import { LRUCache } from 'coreutils/src/LRUCache';

// cache for view data with two tiers:
//   * memory: coreutils LRUCache, bounded by entry count, for instant same-session navigation
//   * disk: an injected PersistentStore-shaped port (native disk storage + weight LRU)

export interface ViewCacheDiskStore {
	fetchString(key: string): Promise<string>;
	remove(key: string): Promise<void>;
	storeString(key: string, value: string, ttlSeconds?: number, weight?: number): Promise<void>;
}

export interface ViewCacheDeps {
	disk: ViewCacheDiskStore;
	maxEntries: number;
}

export const VIEW_CACHE_MAX_ENTRIES = 64;
export const VIEW_CACHE_MAX_BYTES = 8 * 1024 * 1024;

// bump when a cached payload's shape changes incompatibly
const VIEW_CACHE_VERSION = 1;

export class ViewCache {
	private readonly memory: LRUCache<unknown>;

	constructor(private readonly deps: ViewCacheDeps) {
		this.memory = new LRUCache(deps.maxEntries);
	}

	// synchronous in-memory read: lets a view paint from cache during onCreate, before its first
	// render. Returns undefined when the entry isn't resident in memory (use load for disk).
	get<T>(key: string): T | undefined {
		return this.memory.get(this.versionedKey(key)) as T | undefined;
	}

	// async read: returns the in-memory entry, else reads through to disk and hydrates memory.
	// Undefined on a miss or a corrupt blob.
	async load<T>(key: string): Promise<T | undefined> {
		const versioned = this.versionedKey(key);
		const cached = this.memory.get(versioned);
		if (cached !== undefined) {
			return cached as T;
		}

		let raw: string;
		try {
			raw = await this.deps.disk.fetchString(versioned);
		} catch {
			return undefined;
		}

		let parsed: unknown;
		try {
			parsed = JSON.parse(raw);
		} catch {
			return undefined;
		}

		this.memory.insert(versioned, parsed);
		return parsed as T;
	}

	// write memory synchronously (so a following get hits) and persist to disk fire-and-forget
	store<T>(key: string, value: T): void {
		const versioned = this.versionedKey(key);
		this.memory.insert(versioned, value);
		const serialized = JSON.stringify(value);
		void this.deps.disk
			.storeString(versioned, serialized, undefined, serialized.length)
			.catch(() => {});
	}

	invalidate(key: string): void {
		const versioned = this.versionedKey(key);
		this.memory.remove(versioned);
		void this.deps.disk.remove(versioned).catch(() => {});
	}

	private versionedKey(key: string): string {
		return `v${VIEW_CACHE_VERSION}:${key}`;
	}
}
