// @ts-nocheck
import { AssetOutputType, addAssetLoadObserver } from 'valdi_core/src/Asset';
import { guessMimeType } from '../images/MimeType';

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

export type ImageCategory =
	| 'artist_image'
	| 'artist_logo'
	| 'album_art'
	| 'album_art_blurred'
	| 'playlist_image';

export interface ClearCacheSelection {
	albumArt: boolean;
	albumArtBlurred: boolean;
	artistImage: boolean;
	artistLogo: boolean;
	playlistImage: boolean;
	tracks: boolean;
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
		if (selection.albumArtBlurred) categories.push('album_art_blurred');
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

	// Called by App after it loads album art bytes from the native bootstrap.
	async storeBlurred(url: string, buffer: ArrayBuffer, mimeType: string): Promise<void> {
		if (this.memory.has(this.memoryKey(url, 'album_art_blurred'))) return;
		await this.generateAndStoreBlurred(url, buffer, mimeType);
	}

	// Downscales the image to 24×24 via OffscreenCanvas, encodes to PNG using
	// pure JS (avoids convertToBlob which is unavailable in native runtimes),
	// and stores the result in the persistent store so it can be served via the
	// atolla-cache:// URL scheme. When rendered full-screen the GPU upscale
	// produces a very heavy blur. Also stores a data URI in memory as fallback.
	private async generateAndStoreBlurred(
		url: string,
		buffer: ArrayBuffer,
		mimeType: string,
	): Promise<void> {
		try {
			const SIZE = 24;
			const blob = new Blob([buffer], { type: mimeType });
			const bitmap = await createImageBitmap(blob);
			const canvas = new OffscreenCanvas(SIZE, SIZE);
			const ctx = canvas.getContext('2d');
			if (!ctx) return;
			ctx.drawImage(bitmap, 0, 0, SIZE, SIZE);
			const { data } = ctx.getImageData(0, 0, SIZE, SIZE);
			const png = encodePng(new Uint8Array(data.buffer), SIZE, SIZE);
			const storeKey = this.storeKey(url, 'album_art_blurred');
			// Persist so the atolla-cache:// handler can serve it as an image URL.
			try {
				await this.store.store(storeKey, png, undefined, png.byteLength);
			} catch {
				// Persistence failed — data URI fallback still set below.
			}
			this.memory.set(this.memoryKey(url, 'album_art_blurred'), toDataUri(png, 'image/png'));
			this.notify();
		} catch {
			// Non-critical — blur generation is best-effort
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

// Encodes raw RGBA pixel data (w×h) into a valid PNG ArrayBuffer using only
// pure JS — no convertToBlob, no browser DOM required. Uses an uncompressed
// deflate stored block so there's no zlib implementation needed.
function encodePng(rgba: Uint8Array, w: number, h: number): ArrayBuffer {
	const crc32 = (d: Uint8Array): number => {
		let c = 0xffffffff;
		for (const b of d) {
			c ^= b;
			for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
		}
		return (c ^ 0xffffffff) >>> 0;
	};
	const adler32 = (d: Uint8Array): number => {
		let a = 1,
			b = 0;
		for (const v of d) {
			a = (a + v) % 65521;
			b = (b + a) % 65521;
		}
		return (b << 16) | a;
	};
	const mkChunk = (type: string, data: Uint8Array): Uint8Array => {
		const out = new Uint8Array(12 + data.length);
		const dv = new DataView(out.buffer);
		dv.setUint32(0, data.length);
		for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
		out.set(data, 8);
		const forCrc = new Uint8Array(4 + data.length);
		for (let i = 0; i < 4; i++) forCrc[i] = type.charCodeAt(i);
		forCrc.set(data, 4);
		dv.setUint32(8 + data.length, crc32(forCrc));
		return out;
	};

	// IHDR: 8-bit RGB
	const ihdr = new Uint8Array(13);
	const ihdrDv = new DataView(ihdr.buffer);
	ihdrDv.setUint32(0, w);
	ihdrDv.setUint32(4, h);
	ihdr[8] = 8;
	ihdr[9] = 2; // colour type: RGB

	// Raw scanlines: filter byte 0 (None) + R G B per pixel
	const sl = 1 + w * 3;
	const raw = new Uint8Array(h * sl);
	for (let y = 0; y < h; y++) {
		raw[y * sl] = 0;
		for (let x = 0; x < w; x++) {
			const s = (y * w + x) * 4;
			const d = y * sl + 1 + x * 3;
			raw[d] = rgba[s];
			raw[d + 1] = rgba[s + 1];
			raw[d + 2] = rgba[s + 2];
		}
	}

	// IDAT: zlib header + uncompressed deflate block + adler32
	const idat = new Uint8Array(2 + 5 + raw.length + 4);
	const idatDv = new DataView(idat.buffer);
	idat[0] = 0x78;
	idat[1] = 0x01; // zlib CMF+FLG (check: (0x78*256+0x01)%31 === 0 ✓)
	idat[2] = 0x01; // BFINAL=1, BTYPE=00 (stored, no compression)
	idatDv.setUint16(3, raw.length, true);
	idatDv.setUint16(5, ~raw.length & 0xffff, true);
	idat.set(raw, 7);
	idatDv.setUint32(7 + raw.length, adler32(raw)); // big-endian adler32

	const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
	const parts = [
		sig,
		mkChunk('IHDR', ihdr),
		mkChunk('IDAT', idat),
		mkChunk('IEND', new Uint8Array(0)),
	];
	const total = parts.reduce((s, p) => s + p.length, 0);
	const out = new Uint8Array(total);
	let off = 0;
	for (const p of parts) {
		out.set(p, off);
		off += p.length;
	}
	return out.buffer;
}

function toDataUri(buffer: ArrayBuffer, mimeType: string): string {
	const bytes = new Uint8Array(buffer);
	let binary = '';
	for (let i = 0; i < bytes.length; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	return `data:${mimeType};base64,${btoa(binary)}`;
}
