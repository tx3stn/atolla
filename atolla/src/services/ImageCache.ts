export interface ImageStore {
	exists(key: string): Promise<boolean>;
	fetch(key: string): Promise<ArrayBuffer>;
	store(key: string, value: ArrayBuffer, ttlSeconds?: number, weight?: number): Promise<void>;
}

type ImageListener = () => void;

export const IMAGE_CACHE_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

export class ImageCache {
	private memory = new Map<string, string>();
	private pending = new Set<string>();
	private listeners = new Set<ImageListener>();

	constructor(
		private store: ImageStore,
		private fetchFn: (url: string) => Promise<Response> = (url) => fetch(url),
	) {}

	get(url: string): string | null {
		return this.memory.get(url) ?? null;
	}

	prefetch(urls: Array<string>): Promise<void> {
		const loads = urls
			.filter((url) => url && !this.memory.has(url) && !this.pending.has(url))
			.map((url) => {
				this.pending.add(url);
				return this.loadUrl(url);
			});
		return Promise.all(loads).then(() => undefined);
	}

	subscribe(listener: ImageListener): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private async loadUrl(url: string): Promise<void> {
		try {
			if (await this.store.exists(url)) {
				const buffer = await this.store.fetch(url);
				this.memory.set(url, toDataUri(buffer, guessMimeType(url)));
				this.notify();
				return;
			}

			const response = await this.fetchFn(url);
			const contentType = response.headers.get('content-type') ?? 'image/jpeg';
			const mimeType = contentType.split(';')[0].trim();
			const buffer = await response.arrayBuffer();
			await this.store.store(url, buffer, IMAGE_CACHE_TTL_SECONDS, buffer.byteLength);
			this.memory.set(url, toDataUri(buffer, mimeType));
			this.notify();
		} catch {
			// Silent fail — resolveArtworkSource falls back to the original URL
		} finally {
			this.pending.delete(url);
		}
	}

	private notify(): void {
		for (const listener of this.listeners) {
			listener();
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
