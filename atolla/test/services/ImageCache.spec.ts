// @ts-nocheck
import 'jasmine/src/jasmine';
import { ImageCache, type ImageLoaderFn, type ImageStore } from 'atolla/src/services/ImageCache';

const imageBytes = new Uint8Array([1, 2, 3, 4]);
const imageUrl = 'https://example.com/image.jpg';

describe('ImageCache', () => {
	describe('get()', () => {
		it('returns null when url has not been cached', () => {
			const cache = new ImageCache(new MockImageStore(), failingLoader());
			expect(cache.get(imageUrl)).toBeNull();
		});

		it('returns a data URI after prefetch resolves', async () => {
			const cache = new ImageCache(new MockImageStore(), mockLoader(imageUrl, imageBytes));
			await cache.prefetch([imageUrl]);
			expect(cache.get(imageUrl)).toMatch(/^data:image\/jpeg;base64,/);
		});
	});

	describe('prefetch()', () => {
		it('fetches from loader and stores in persistent store', async () => {
			const store = new MockImageStore();
			const cache = new ImageCache(store, mockLoader(imageUrl, imageBytes));
			await cache.prefetch([imageUrl]);
			expect(await store.exists(imageUrl)).toBe(true);
		});

		it('loads from persistent store when image is already stored', async () => {
			const store = new MockImageStore();
			store.seed(imageUrl, imageBytes.buffer);
			let loaderCalls = 0;
			const loaderFn: ImageLoaderFn = () => {
				loaderCalls++;
				return Promise.reject(new Error('Should not call loader'));
			};
			const cache = new ImageCache(store, loaderFn);
			await cache.prefetch([imageUrl]);
			expect(loaderCalls).toBe(0);
			expect(cache.get(imageUrl)).toMatch(/^data:image\//);
		});

		it('skips urls already in memory', async () => {
			let loadCount = 0;
			const countingLoader: ImageLoaderFn = (url) => {
				loadCount++;
				return mockLoader(url, imageBytes)(url);
			};
			const cache = new ImageCache(new MockImageStore(), countingLoader);
			await cache.prefetch([imageUrl]);
			await cache.prefetch([imageUrl]);
			expect(loadCount).toBe(1);
		});

		it('skips urls with no value', async () => {
			const cache = new ImageCache(new MockImageStore(), failingLoader());
			await cache.prefetch(['']);
			expect(cache.get('')).toBeNull();
		});

		it('handles loader errors silently', async () => {
			const cache = new ImageCache(new MockImageStore(), failingLoader());
			await cache.prefetch([imageUrl]);
			expect(cache.get(imageUrl)).toBeNull();
		});

		it('uses mimeType from loader for data URI', async () => {
			const cache = new ImageCache(
				new MockImageStore(),
				mockLoader(imageUrl, imageBytes, 'image/webp'),
			);
			await cache.prefetch([imageUrl]);
			expect(cache.get(imageUrl)).toMatch(/^data:image\/webp;base64,/);
		});

		it('prefetches multiple urls', async () => {
			const url2 = 'https://example.com/image2.jpg';
			const loaderFn: ImageLoaderFn = async (url) => mockLoader(url, imageBytes)(url);
			const cache = new ImageCache(new MockImageStore(), loaderFn);
			await cache.prefetch([imageUrl, url2]);
			expect(cache.get(imageUrl)).not.toBeNull();
			expect(cache.get(url2)).not.toBeNull();
		});
	});

	describe('subscribe()', () => {
		it('notifies listener when an image is cached from loader', async () => {
			const cache = new ImageCache(new MockImageStore(), mockLoader(imageUrl, imageBytes));
			let calls = 0;
			cache.subscribe(() => calls++);
			await cache.prefetch([imageUrl]);
			expect(calls).toBe(1);
		});

		it('notifies listener when an image is loaded from persistent store', async () => {
			const store = new MockImageStore();
			store.seed(imageUrl, imageBytes.buffer);
			const cache = new ImageCache(store, failingLoader());
			let calls = 0;
			cache.subscribe(() => calls++);
			await cache.prefetch([imageUrl]);
			expect(calls).toBe(1);
		});

		it('notifies listener on loader error so lastError can be displayed', async () => {
			const cache = new ImageCache(new MockImageStore(), failingLoader());
			let calls = 0;
			cache.subscribe(() => calls++);
			await cache.prefetch([imageUrl]);
			expect(calls).toBe(1);
			expect(cache.lastError).not.toBeNull();
		});

		it('returns an unsubscribe function that stops notifications', async () => {
			const cache = new ImageCache(new MockImageStore(), mockLoader(imageUrl, imageBytes));
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

function mockLoader(url: string, data: Uint8Array, mimeType = 'image/jpeg'): ImageLoaderFn {
	return (loaderUrl: string) => {
		if (loaderUrl !== url) return Promise.reject(new Error(`Unexpected URL: ${loaderUrl}`));
		return Promise.resolve({ buffer: data.buffer as ArrayBuffer, mimeType });
	};
}

function failingLoader(): ImageLoaderFn {
	return () => Promise.reject(new Error('Loader error'));
}
