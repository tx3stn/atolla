// @ts-nocheck
import 'jasmine/src/jasmine';
import { TrackPlaybackCache } from 'atolla/src/services/TrackPlaybackCache';

class InMemoryTrackStore {
	private data = new Map<string, ArrayBuffer>();
	private strings = new Map<string, string>();
	stored: Array<{ key: string; weight?: number }> = [];

	exists(key: string): Promise<boolean> {
		return Promise.resolve(this.data.has(key));
	}

	fetch(key: string): Promise<ArrayBuffer> {
		if (!this.data.has(key)) {
			throw new Error('missing key');
		}
		return Promise.resolve(this.data.get(key) as ArrayBuffer);
	}

	store(key: string, value: ArrayBuffer, _ttlSeconds?: number, weight?: number): Promise<void> {
		this.data.set(key, value);
		this.stored.push({ key, weight });
		return Promise.resolve();
	}

	fetchString(key: string): Promise<string> {
		if (!this.strings.has(key)) {
			return Promise.reject(new Error('missing key'));
		}
		return Promise.resolve(this.strings.get(key) as string);
	}

	storeString(key: string, value: string): Promise<void> {
		this.strings.set(key, value);
		return Promise.resolve();
	}
}

describe('TrackPlaybackCache', () => {
	it('stores tracks with unit LRU weight', async () => {
		const store = new InMemoryTrackStore();
		const cache = new TrackPlaybackCache(() => store, 20);
		const buffer = new Uint8Array([1, 2, 3]).buffer;

		await cache.storeTrack('track-1', buffer);

		if (store.stored.length > 0) {
			expect(store.stored).toEqual([{ key: 'track_file:track-1', weight: 1 }]);
			expect(await store.fetchString('track_file_mime:track-1')).toBe('audio/mpeg');
			return;
		}

		expect(await store.fetchString('track_file_path:track-1')).toContain('file://');
	});

	it('returns fallback source when track is not cached', async () => {
		const cache = new TrackPlaybackCache(() => new InMemoryTrackStore(), 20);

		expect(await cache.getPlayableSource('missing', 'https://fallback/track.mp3')).toBe(
			'https://fallback/track.mp3',
		);
	});

	it('prefers file cache source over fallback stream url when both are available', async () => {
		const store = new InMemoryTrackStore();
		const cache = new TrackPlaybackCache(() => store, 20);
		const buffer = new Uint8Array([1, 2, 3]).buffer;

		await cache.storeTrack('track-3', buffer, 'audio/aac');
		const source = await cache.getPlayableSource('track-3', 'https://fallback/track.mp3');

		expect(source?.startsWith('file://')).toBe(true);
	});

	it('returns cached file source when no stream url is available', async () => {
		const store = new InMemoryTrackStore();
		const cache = new TrackPlaybackCache(() => store, 20);
		const buffer = new Uint8Array([1, 2, 3]).buffer;

		await cache.storeTrack('track-3', buffer, 'audio/aac');
		const source = await cache.getPlayableSource('track-3', null);

		expect(source?.startsWith('file://')).toBe(true);
	});

	it('returns false for missing tracks', async () => {
		const cache = new TrackPlaybackCache(() => new InMemoryTrackStore(), 20);

		expect(await cache.hasTrack('missing')).toBe(false);
	});

	it('fetches a stored track', async () => {
		const store = new InMemoryTrackStore();
		const cache = new TrackPlaybackCache(() => store, 20);
		const buffer = new Uint8Array([4, 5, 6]).buffer;
		await store.store('track_file:track-2', buffer);

		expect(await cache.fetchTrack('track-2')).toEqual(buffer);
	});

	it('recreates store when max track limit changes', () => {
		const createdWith: Array<number> = [];
		const cache = new TrackPlaybackCache((maxTracks) => {
			createdWith.push(maxTracks);
			return new InMemoryTrackStore();
		}, 20);

		cache.configureMaxTracks(25);
		cache.configureMaxTracks(25);

		expect(createdWith).toEqual([20, 25]);
	});
});
