import { describe, expect, it } from 'bun:test';
import { ImageCache, type ImageStore } from './ImageCache';

const imageBytes = new Uint8Array([1, 2, 3, 4]);
const imageUrl = 'https://example.com/image.jpg';

describe('ImageCache', () => {
	describe('get()', () => {
		it('returns null when url has not been cached', () => {
			const cache = new ImageCache(new MockImageStore(), failingFetch());
			expect(cache.get(imageUrl)).toBeNull();
		});

		it('returns a data URI after prefetch resolves', async () => {
			const cache = new ImageCache(new MockImageStore(), mockFetch(imageUrl, imageBytes));
			await cache.prefetch([imageUrl]);
			expect(cache.get(imageUrl)).toMatch(/^data:image\/jpeg;base64,/);
		});
	});

	describe('prefetch()', () => {
		it('fetches from network and stores in persistent store', async () => {
			const store = new MockImageStore();
			const cache = new ImageCache(store, mockFetch(imageUrl, imageBytes));
			await cache.prefetch([imageUrl]);
			expect(await store.exists(imageUrl)).toBe(true);
		});

		it('loads from persistent store when image is already stored', async () => {
			const store = new MockImageStore();
			store.seed(imageUrl, imageBytes.buffer);
			let networkCalls = 0;
			const fetchFn = () => {
				networkCalls++;
				return Promise.reject(new Error('Should not fetch from network'));
			};
			const cache = new ImageCache(store, fetchFn);
			await cache.prefetch([imageUrl]);
			expect(networkCalls).toBe(0);
			expect(cache.get(imageUrl)).toMatch(/^data:image\//);
		});

		it('skips urls already in memory', async () => {
			let fetchCount = 0;
			const countingFetch = (url: string) => {
				fetchCount++;
				return mockFetch(url, imageBytes)(url);
			};
			const cache = new ImageCache(new MockImageStore(), countingFetch);
			await cache.prefetch([imageUrl]);
			await cache.prefetch([imageUrl]);
			expect(fetchCount).toBe(1);
		});

		it('skips urls with no value', async () => {
			const cache = new ImageCache(new MockImageStore(), failingFetch());
			await cache.prefetch(['']);
			expect(cache.get('')).toBeNull();
		});

		it('handles network errors silently', async () => {
			const cache = new ImageCache(new MockImageStore(), failingFetch());
			await expect(cache.prefetch([imageUrl])).resolves.toBeUndefined();
			expect(cache.get(imageUrl)).toBeNull();
		});

		it('uses content-type from response headers for data URI', async () => {
			const cache = new ImageCache(
				new MockImageStore(),
				mockFetch(imageUrl, imageBytes, 'image/webp'),
			);
			await cache.prefetch([imageUrl]);
			expect(cache.get(imageUrl)).toMatch(/^data:image\/webp;base64,/);
		});

		it('prefetches multiple urls', async () => {
			const url2 = 'https://example.com/image2.jpg';
			const fetchFn = async (url: string) => mockFetch(url, imageBytes)(url);
			const cache = new ImageCache(new MockImageStore(), fetchFn);
			await cache.prefetch([imageUrl, url2]);
			expect(cache.get(imageUrl)).not.toBeNull();
			expect(cache.get(url2)).not.toBeNull();
		});
	});

	describe('subscribe()', () => {
		it('notifies listener when an image is cached from network', async () => {
			const cache = new ImageCache(new MockImageStore(), mockFetch(imageUrl, imageBytes));
			let calls = 0;
			cache.subscribe(() => calls++);
			await cache.prefetch([imageUrl]);
			expect(calls).toBe(1);
		});

		it('notifies listener when an image is loaded from persistent store', async () => {
			const store = new MockImageStore();
			store.seed(imageUrl, imageBytes.buffer);
			const cache = new ImageCache(store, failingFetch());
			let calls = 0;
			cache.subscribe(() => calls++);
			await cache.prefetch([imageUrl]);
			expect(calls).toBe(1);
		});

		it('does not notify listener on network error', async () => {
			const cache = new ImageCache(new MockImageStore(), failingFetch());
			let calls = 0;
			cache.subscribe(() => calls++);
			await cache.prefetch([imageUrl]);
			expect(calls).toBe(0);
		});

		it('returns an unsubscribe function that stops notifications', async () => {
			const cache = new ImageCache(new MockImageStore(), mockFetch(imageUrl, imageBytes));
			let calls = 0;
			const unsubscribe = cache.subscribe(() => calls++);
			unsubscribe();
			await cache.prefetch([imageUrl]);
			expect(calls).toBe(0);
		});
	});
});

class MockImageStore implements ImageStore {
	private data = new Map<string, ArrayBuffer>();

	exists(key: string): Promise<boolean> {
		return Promise.resolve(this.data.has(key));
	}

	fetch(key: string): Promise<ArrayBuffer> {
		const value = this.data.get(key);
		if (!value) return Promise.reject(new Error(`Key not found: ${key}`));
		return Promise.resolve(value);
	}

	store(key: string, value: ArrayBuffer): Promise<void> {
		this.data.set(key, value);
		return Promise.resolve();
	}

	seed(key: string, value: ArrayBuffer): void {
		this.data.set(key, value);
	}
}

function mockFetch(
	url: string,
	data: Uint8Array,
	contentType = 'image/jpeg',
): (fetchUrl: string) => Promise<Response> {
	return (fetchUrl: string) => {
		if (fetchUrl !== url) return Promise.reject(new Error(`Unexpected URL: ${fetchUrl}`));
		return Promise.resolve({
			arrayBuffer: () => Promise.resolve(data.buffer),
			headers: { get: (h: string) => (h === 'content-type' ? contentType : null) },
		} as unknown as Response);
	};
}

function failingFetch(): (url: string) => Promise<Response> {
	return () => Promise.reject(new Error('Network error'));
}
