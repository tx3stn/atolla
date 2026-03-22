// @ts-nocheck
import 'jasmine/src/jasmine';
import { ImageCache, type ImageLoaderFn, type ImageStore } from 'atolla/src/services/ImageCache';

const imageBytes = new Uint8Array([1, 2, 3, 4]);
const imageUrl = 'https://example.com/image.jpg';
const defaultCategory = 'album_art';

describe('ImageCache', () => {
	describe('get()', () => {
		it('returns null when url has not been cached', () => {
			const cache = new ImageCache(new MockImageStore(), failingLoader());
			expect(cache.get(imageUrl, defaultCategory)).toBeNull();
		});

		it('returns a data URI after prefetch resolves', async () => {
			const cache = new ImageCache(new MockImageStore(), mockLoader(imageUrl, imageBytes));
			await cache.prefetch([imageUrl], defaultCategory);
			expect(cache.get(imageUrl, defaultCategory)).toMatch(/^data:image\/jpeg;base64,/);
		});
	});

	describe('prefetch()', () => {
		it('fetches from loader and stores in persistent store', async () => {
			const store = new MockImageStore();
			const cache = new ImageCache(store, mockLoader(imageUrl, imageBytes));
			await cache.prefetch([imageUrl], defaultCategory);
			expect(await store.exists(keyFor(defaultCategory, imageUrl))).toBe(true);
		});

		it('loads from persistent store when image is already stored', async () => {
			const store = new MockImageStore();
			store.seed(keyFor(defaultCategory, imageUrl), imageBytes.buffer);
			let loaderCalls = 0;
			const loaderFn: ImageLoaderFn = () => {
				loaderCalls++;
				return Promise.reject(new Error('Should not call loader'));
			};
			const cache = new ImageCache(store, loaderFn);
			await cache.prefetch([imageUrl], defaultCategory);
			expect(loaderCalls).toBe(0);
			expect(cache.get(imageUrl, defaultCategory)).toMatch(/^data:image\//);
		});

		it('skips urls already in memory', async () => {
			let loadCount = 0;
			const countingLoader: ImageLoaderFn = (url) => {
				loadCount++;
				return mockLoader(url, imageBytes)(url);
			};
			const cache = new ImageCache(new MockImageStore(), countingLoader);
			await cache.prefetch([imageUrl], defaultCategory);
			await cache.prefetch([imageUrl], defaultCategory);
			expect(loadCount).toBe(1);
		});

		it('skips urls with no value', async () => {
			const cache = new ImageCache(new MockImageStore(), failingLoader());
			await cache.prefetch([''], defaultCategory);
			expect(cache.get('', defaultCategory)).toBeNull();
		});

		it('handles loader errors silently', async () => {
			const cache = new ImageCache(new MockImageStore(), failingLoader());
			await cache.prefetch([imageUrl], defaultCategory);
			expect(cache.get(imageUrl, defaultCategory)).toBeNull();
		});

		it('uses mimeType from loader for data URI', async () => {
			const cache = new ImageCache(
				new MockImageStore(),
				mockLoader(imageUrl, imageBytes, 'image/webp'),
			);
			await cache.prefetch([imageUrl], defaultCategory);
			expect(cache.get(imageUrl, defaultCategory)).toMatch(/^data:image\/webp;base64,/);
		});

		it('prefetches multiple urls', async () => {
			const url2 = 'https://example.com/image2.jpg';
			const loaderFn: ImageLoaderFn = async (url) => mockLoader(url, imageBytes)(url);
			const cache = new ImageCache(new MockImageStore(), loaderFn);
			await cache.prefetch([imageUrl, url2], defaultCategory);
			expect(cache.get(imageUrl, defaultCategory)).not.toBeNull();
			expect(cache.get(url2, defaultCategory)).not.toBeNull();
		});
	});

	describe('subscribe()', () => {
		it('notifies listener when an image is cached from loader', async () => {
			const cache = new ImageCache(new MockImageStore(), mockLoader(imageUrl, imageBytes));
			let calls = 0;
			cache.subscribe(() => calls++);
			await cache.prefetch([imageUrl], defaultCategory);
			expect(calls).toBe(1);
		});

		it('notifies listener when an image is loaded from persistent store', async () => {
			const store = new MockImageStore();
			store.seed(keyFor(defaultCategory, imageUrl), imageBytes.buffer);
			const cache = new ImageCache(store, failingLoader());
			let calls = 0;
			cache.subscribe(() => calls++);
			await cache.prefetch([imageUrl], defaultCategory);
			expect(calls).toBe(1);
		});

		it('notifies listener on loader error so lastError can be displayed', async () => {
			const cache = new ImageCache(new MockImageStore(), failingLoader());
			let calls = 0;
			cache.subscribe(() => calls++);
			await cache.prefetch([imageUrl], defaultCategory);
			expect(calls).toBe(1);
			expect(cache.lastError).not.toBeNull();
		});

		it('returns an unsubscribe function that stops notifications', async () => {
			const cache = new ImageCache(new MockImageStore(), mockLoader(imageUrl, imageBytes));
			let calls = 0;
			const unsubscribe = cache.subscribe(() => calls++);
			unsubscribe();
			await cache.prefetch([imageUrl], defaultCategory);
			expect(calls).toBe(0);
		});
	});

	describe('category-scoped caching', () => {
		it('does not share entries across categories for the same url', async () => {
			const store = new MockImageStore();
			const calls: Array<string> = [];
			const loaderFn: ImageLoaderFn = (url: string, category?: string) => {
				calls.push(`${category}:${url}`);
				return {
					buffer: imageBytes.buffer as ArrayBuffer,
					mimeType: 'image/jpeg',
				};
			};

			const cache = new ImageCache(store, loaderFn);

			// First load in album category
			expect(cache.getOrLoad(imageUrl, 'album_art')).toBe(imageUrl);
			await cache.prefetch([imageUrl], 'album_art');
			const albumArtCached = cache.get(imageUrl, 'album_art');
			expect(albumArtCached).toMatch(/^data:image\/jpeg;base64,/);

			// Same URL in artist category should be independent
			expect(cache.get(imageUrl, 'artist_image')).toBeNull();
			expect(cache.getOrLoad(imageUrl, 'artist_image')).toBe(imageUrl);
			await cache.prefetch([imageUrl], 'artist_image');

			const artistImageCached = cache.get(imageUrl, 'artist_image');
			expect(artistImageCached).toMatch(/^data:image\/jpeg;base64,/);

			expect(await store.exists(keyFor('album_art', imageUrl))).toBe(true);
			expect(await store.exists(keyFor('artist_image', imageUrl))).toBe(true);

			expect(calls).toEqual([`album_art:${imageUrl}`, `artist_image:${imageUrl}`]);
		});
	});

	describe('storage policy', () => {
		it('stores fetched images without ttl so lru controls eviction', async () => {
			const store = new RecordingImageStore();
			const cache = new ImageCache(store, mockLoader(imageUrl, imageBytes));

			await cache.prefetch([imageUrl], defaultCategory);

			expect(store.storeCalls.length).toBe(1);
			expect(store.storeCalls[0].ttlSeconds).toBeUndefined();
		});
	});

	describe('clear selected categories', () => {
		it('clears only selected image categories', async () => {
			const store = new RecordingImageStore();
			const cache = new ImageCache(store, mockLoader(imageUrl, imageBytes));

			await cache.clearSelected({
				albumArt: true,
				artistImage: false,
				artistLogo: false,
				playlistImage: true,
			});

			expect(store.removeCalls).toEqual(['image_cache:album_art', 'image_cache:playlist_image']);
		});
	});
});

function keyFor(category: string, url: string): string {
	return `${category}:${url}`;
}

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

class RecordingImageStore implements ImageStore {
	storeCalls: Array<{ key: string; ttlSeconds?: number; weight?: number }> = [];
	removeCalls: Array<string> = [];

	exists(_key: string): Promise<boolean> {
		return Promise.resolve(false);
	}

	fetch(_key: string): Promise<ArrayBuffer> {
		return Promise.reject(new Error('not found'));
	}

	store(key: string, _value: ArrayBuffer, ttlSeconds?: number, weight?: number): Promise<void> {
		this.storeCalls.push({ key, ttlSeconds, weight });
		return Promise.resolve();
	}

	remove(key: string): Promise<void> {
		this.removeCalls.push(key);
		return Promise.resolve();
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
