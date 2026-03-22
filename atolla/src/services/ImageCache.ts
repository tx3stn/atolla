// @ts-nocheck
import { AssetOutputType, addAssetLoadObserver } from 'valdi_core/src/Asset';

export interface ImageStore {
	exists(key: string): Promise<boolean>;
	fetch(key: string): Promise<ArrayBuffer>;
	fetchAll?(): Promise<Record<string, unknown>>;
	remove?(key: string): Promise<void>;
	store(key: string, value: ArrayBuffer, ttlSeconds?: number, weight?: number): Promise<void>;
}

export type ImageLoaderFn = (
	url: string,
	category?: ImageCategory,
) => Promise<{ buffer: ArrayBuffer; mimeType: string } | null>;

export type ImageCategory = 'artist_image' | 'artist_logo' | 'album_art' | 'playlist_image';

export interface ClearCacheSelection {
	albumArt: boolean;
	artistImage: boolean;
	artistLogo: boolean;
	playlistImage: boolean;
}

type ImageListener = () => void;
type ImageStoredListener = (url: string, buffer: ArrayBuffer, mimeType: string) => void;
type ImageKeyListener = () => void;

function defaultLoader(url: string): Promise<{ buffer: ArrayBuffer; mimeType: string } | null> {
	return new Promise((resolve) => {
		let sub: { unsubscribe(): void } | undefined;
		const onLoad = (loadedAsset: unknown, error: string | undefined) => {
			sub?.unsubscribe();
			if (error || !loadedAsset) {
				resolve(null);
				return;
			}
			const bytes = loadedAsset as Uint8Array;
			const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
			resolve({ buffer, mimeType: guessMimeType(url) });
		};
		sub = addAssetLoadObserver(url, onLoad, AssetOutputType.BYTES);
	});
}

export class ImageCache {
	private memory = new Map<string, string>();
	private buffers = new Map<string, { buffer: ArrayBuffer; mimeType: string }>();
	private queue: Array<{ category: ImageCategory; url: string }> = [];
	private activeLoads = 0;
	private readonly maxConcurrentLoads = 4;
	private pending = new Set<string>();
	private listeners = new Set<ImageListener>();
	private keyListeners = new Map<string, Set<ImageKeyListener>>();
	private storedListeners = new Set<ImageStoredListener>();
	lastError: string | null = null;

	get bufferedCount(): number {
		return this.buffers.size;
	}

	get bufferedBytes(): number {
		let total = 0;
		for (const { buffer } of this.buffers.values()) total += buffer.byteLength;
		return total;
	}

	getBuffer(
		url: string,
		category: ImageCategory,
	): { buffer: ArrayBuffer; mimeType: string } | null {
		return this.buffers.get(this.memoryKey(url, category)) ?? null;
	}

	constructor(
		private store: ImageStore,
		private loaderFn: ImageLoaderFn = defaultLoader,
	) {}

	get(url: string, category: ImageCategory): string | null {
		return this.memory.get(this.memoryKey(url, category)) ?? null;
	}

	// Returns the cached data URI if available, otherwise kicks off a load and
	// returns the raw URL as a temporary fallback. This preserves existing
	// behavior for callers while the cache load happens in the background.
	getOrLoad(url: string, category: ImageCategory): string | null {
		if (!url) return null;
		const key = this.memoryKey(url, category);
		const cached = this.memory.get(key);
		if (cached) return cached;

		if (!this.pending.has(key)) {
			this.enqueueLoad(url, category);
		}
		return url;
	}

	prefetch(urls: Array<string>, category: ImageCategory): Promise<void> {
		const requestedKeys: Array<string> = [];
		for (const url of urls) {
			if (!url) continue;
			const key = this.memoryKey(url, category);
			requestedKeys.push(key);
			if (this.memory.has(key) || this.pending.has(key)) continue;
			this.enqueueLoad(url, category);
		}
		return this.waitForKeys(requestedKeys);
	}

	async clearSelected(selection: ClearCacheSelection): Promise<void> {
		const categories: Array<ImageCategory> = [];
		if (selection.artistImage) categories.push('artist_image');
		if (selection.artistLogo) categories.push('artist_logo');
		if (selection.albumArt) categories.push('album_art');
		if (selection.playlistImage) categories.push('playlist_image');

		await Promise.all(categories.map((category) => this.clearCategory(category)));
		this.notify();
	}

	subscribe(listener: ImageListener): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	subscribeTo(url: string, category: ImageCategory, listener: ImageKeyListener): () => void {
		const key = this.memoryKey(url, category);
		let listeners = this.keyListeners.get(key);
		if (!listeners) {
			listeners = new Set<ImageKeyListener>();
			this.keyListeners.set(key, listeners);
		}
		listeners.add(listener);

		return () => {
			const current = this.keyListeners.get(key);
			if (!current) {
				return;
			}
			current.delete(listener);
			if (current.size === 0) {
				this.keyListeners.delete(key);
			}
		};
	}

	// Force-fires onImageStored for a URL that is already in the in-memory
	// buffer cache, or falls back to loading from the persistent store /
	// native loader. Used to trigger palette extraction without a round-trip.
	async reload(url: string, category: ImageCategory): Promise<void> {
		if (!url) return;
		const key = this.memoryKey(url, category);
		const cached = this.buffers.get(key);
		if (cached) {
			this.notifyStored(url, cached.buffer, cached.mimeType);
			return;
		}
		if (this.pending.has(key)) return;
		this.pending.add(key);
		await this.loadUrl(url, category);
	}

	onImageStored(listener: ImageStoredListener): () => void {
		this.storedListeners.add(listener);
		return () => this.storedListeners.delete(listener);
	}

	private enqueueLoad(url: string, category: ImageCategory): void {
		const key = this.memoryKey(url, category);
		if (this.pending.has(key) || this.memory.has(key)) {
			return;
		}

		this.pending.add(key);
		this.queue.push({ category, url });
		this.drainQueue();
	}

	private drainQueue(): void {
		while (this.activeLoads < this.maxConcurrentLoads && this.queue.length > 0) {
			const next = this.queue.shift();
			if (!next) {
				return;
			}

			this.activeLoads += 1;
			void this.loadUrl(next.url, next.category).finally(() => {
				this.activeLoads -= 1;
				this.drainQueue();
			});
		}
	}

	private waitForKeys(keys: Array<string>): Promise<void> {
		if (keys.every((key) => !this.pending.has(key))) {
			return Promise.resolve();
		}

		return new Promise((resolve) => {
			const unsubscribe = this.subscribe(() => {
				if (keys.every((key) => !this.pending.has(key))) {
					unsubscribe();
					resolve();
				}
			});
		});
	}

	private async loadUrl(url: string, category: ImageCategory): Promise<void> {
		const memoryKey = this.memoryKey(url, category);
		const storeKey = this.storeKey(url, category);
		try {
			// Try persistent store first
			try {
				if (await this.store.exists(storeKey)) {
					const buffer = await this.store.fetch(storeKey);
					const mimeType = guessMimeType(url);
					this.memory.set(memoryKey, toDataUri(buffer, mimeType));
					this.buffers.set(memoryKey, { buffer, mimeType });
					this.notifyStored(url, buffer, mimeType);
					return;
				}
			} catch {
				// Persistent store unavailable — fall through to native loader
			}

			const result = await this.loaderFn(url, category);
			if (!result) {
				this.lastError = `load failed for ${url.slice(0, 60)}: loader returned null`;
				return;
			}

			const { buffer, mimeType } = result;

			// Populate in-memory cache before attempting persistence — persistence
			// failure must not prevent the buffer from being available for extraction.
			this.memory.set(memoryKey, toDataUri(buffer, mimeType));
			this.buffers.set(memoryKey, { buffer, mimeType });

			try {
				await this.store.store(storeKey, buffer, undefined, buffer.byteLength);
			} catch {
				// Persistence failed — in-memory cache is still set
			}

			this.notifyStored(url, buffer, mimeType);
		} catch (err) {
			this.lastError = `load failed for ${url.slice(0, 60)}: ${String(err)}`;
		} finally {
			this.pending.delete(memoryKey);
			this.notify();
			this.notifyKey(memoryKey);
		}
	}

	private memoryKey(url: string, category: ImageCategory): string {
		return `${category}:${url}`;
	}

	private storeKey(url: string, category: ImageCategory): string {
		return `${category}:${url}`;
	}

	private async clearCategory(category: ImageCategory): Promise<void> {
		const prefix = `${category}:`;
		for (const key of this.memory.keys()) {
			if (key.startsWith(prefix)) this.memory.delete(key);
		}
		for (const key of this.buffers.keys()) {
			if (key.startsWith(prefix)) this.buffers.delete(key);
		}
		for (const key of this.pending) {
			if (key.startsWith(prefix)) this.pending.delete(key);
		}

		if (this.store.fetchAll && this.store.remove) {
			try {
				const all = await this.store.fetchAll();
				for (const key of Object.keys(all)) {
					if (key.startsWith(prefix)) {
						await this.store.remove(key);
					}
				}
			} catch {
				// Fall through to namespace marker removal.
			}
		}

		try {
			await this.store.remove?.(`image_cache:${category}`);
		} catch {
			// Best effort clear operation.
		}
	}

	private notify(): void {
		for (const listener of this.listeners) {
			listener();
		}
	}

	private notifyKey(key: string): void {
		const listeners = this.keyListeners.get(key);
		if (!listeners) {
			return;
		}
		for (const listener of listeners) {
			listener();
		}
	}

	private notifyStored(url: string, buffer: ArrayBuffer, mimeType: string): void {
		for (const listener of this.storedListeners) {
			listener(url, buffer, mimeType);
		}
	}
}

function toDataUri(buffer: ArrayBuffer, mimeType: string): string {
	const bytes = new Uint8Array(buffer);
	let binary = '';
	for (let i = 0; i < bytes.length; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	return `data:${mimeType};base64,${btoa(binary)}`;
}

function guessMimeType(url: string): string {
	const lower = url.toLowerCase();
	if (lower.includes('.png')) return 'image/png';
	if (lower.includes('.webp')) return 'image/webp';
	if (lower.includes('.gif')) return 'image/gif';
	return 'image/jpeg';
}
