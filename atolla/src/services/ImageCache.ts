// @ts-nocheck
import { AssetOutputType, addAssetLoadObserver } from 'valdi_core/src/Asset';

export interface ImageStore {
	exists(key: string): Promise<boolean>;
	fetch(key: string): Promise<ArrayBuffer>;
	store(key: string, value: ArrayBuffer, ttlSeconds?: number, weight?: number): Promise<void>;
}

export type ImageLoaderFn = (
	url: string,
) => Promise<{ buffer: ArrayBuffer; mimeType: string } | null>;

type ImageListener = () => void;
type ImageStoredListener = (url: string, buffer: ArrayBuffer, mimeType: string) => void;

export const IMAGE_CACHE_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

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
	private pending = new Set<string>();
	private listeners = new Set<ImageListener>();
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

	getBuffer(url: string): { buffer: ArrayBuffer; mimeType: string } | null {
		return this.buffers.get(url) ?? null;
	}

	constructor(
		private store: ImageStore,
		private loaderFn: ImageLoaderFn = defaultLoader,
	) {}

	get(url: string): string | null {
		return this.memory.get(url) ?? null;
	}

	// Returns the cached data URI if available, otherwise kicks off a load and
	// returns the raw URL as a temporary fallback. When the load completes,
	// subscribers are notified so callers can re-render with the cached value.
	getOrLoad(url: string): string | null {
		if (!url) return null;
		const cached = this.memory.get(url);
		if (cached) return cached;
		if (!this.pending.has(url)) {
			this.pending.add(url);
			void this.loadUrl(url);
		}
		return url;
	}

	prefetch(urls: Array<string>): Promise<void> {
		const loads = urls
			.filter((url) => url && !this.memory.has(url) && !this.pending.has(url))
			.map((url) => {
				this.pending.add(url);
				return this.loadUrl(url);
			});
		return Promise.allSettled(loads).then(() => undefined);
	}

	subscribe(listener: ImageListener): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	// Force-fires onImageStored for a URL that is already in the in-memory
	// buffer cache, or falls back to loading from the persistent store /
	// native loader. Used to trigger palette extraction without a round-trip.
	async reload(url: string): Promise<void> {
		if (!url) return;
		const cached = this.buffers.get(url);
		if (cached) {
			this.notifyStored(url, cached.buffer, cached.mimeType);
			return;
		}
		if (this.pending.has(url)) return;
		this.pending.add(url);
		await this.loadUrl(url);
	}

	onImageStored(listener: ImageStoredListener): () => void {
		this.storedListeners.add(listener);
		return () => this.storedListeners.delete(listener);
	}

	private async loadUrl(url: string): Promise<void> {
		try {
			// Try persistent store first
			try {
				if (await this.store.exists(url)) {
					const buffer = await this.store.fetch(url);
					const mimeType = guessMimeType(url);
					this.memory.set(url, toDataUri(buffer, mimeType));
					this.buffers.set(url, { buffer, mimeType });
					this.notifyStored(url, buffer, mimeType);
					this.notify();
					return;
				}
			} catch {
				// Persistent store unavailable — fall through to native loader
			}

			const result = await this.loaderFn(url);
			if (!result) {
				this.lastError = `load failed for ${url.slice(0, 60)}: loader returned null`;
				this.notify();
				return;
			}

			const { buffer, mimeType } = result;

			// Populate in-memory cache before attempting persistence — persistence
			// failure must not prevent the buffer from being available for extraction.
			this.memory.set(url, toDataUri(buffer, mimeType));
			this.buffers.set(url, { buffer, mimeType });

			try {
				await this.store.store(url, buffer, IMAGE_CACHE_TTL_SECONDS, buffer.byteLength);
			} catch {
				// Persistence failed — in-memory cache is still set
			}

			this.notifyStored(url, buffer, mimeType);
			this.notify();
		} catch (err) {
			this.lastError = `load failed for ${url.slice(0, 60)}: ${String(err)}`;
			this.notify();
		} finally {
			this.pending.delete(url);
		}
	}

	private notify(): void {
		for (const listener of this.listeners) {
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
