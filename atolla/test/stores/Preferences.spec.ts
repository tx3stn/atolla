// @ts-nocheck
import 'jasmine/src/jasmine';
import {
	DEFAULT_TRACK_CACHE_MAX_TRACKS,
	Preferences,
	TRACK_CACHE_LIMIT_OPTIONS,
} from 'atolla/src/stores/Preferences';

class InMemoryPreferencesStore {
	private data = new Map<string, string>();

	fetchString(key: string): Promise<string> {
		if (!this.data.has(key)) {
			return Promise.reject(new Error('missing key'));
		}
		return Promise.resolve(this.data.get(key) as string);
	}

	storeString(key: string, value: string): Promise<void> {
		this.data.set(key, value);
		return Promise.resolve();
	}
}

describe('Preferences', () => {
	describe('getTrackCacheMaxTracks()', () => {
		it('returns default when preference is missing', async () => {
			const preferences = new Preferences(new InMemoryPreferencesStore());

			expect(await preferences.getTrackCacheMaxTracks()).toBe(DEFAULT_TRACK_CACHE_MAX_TRACKS);
		});

		it('returns default when stored value is invalid', async () => {
			const store = new InMemoryPreferencesStore();
			await store.storeString('track_cache_max_tracks', '999');
			const preferences = new Preferences(store);

			expect(await preferences.getTrackCacheMaxTracks()).toBe(DEFAULT_TRACK_CACHE_MAX_TRACKS);
		});

		it('returns stored value when allowed', async () => {
			const store = new InMemoryPreferencesStore();
			await store.storeString('track_cache_max_tracks', String(TRACK_CACHE_LIMIT_OPTIONS[4]));
			const preferences = new Preferences(store);

			expect(await preferences.getTrackCacheMaxTracks()).toBe(TRACK_CACHE_LIMIT_OPTIONS[4]);
		});
	});

	describe('setTrackCacheMaxTracks()', () => {
		it('stores allowed value', async () => {
			const store = new InMemoryPreferencesStore();
			const preferences = new Preferences(store);

			await preferences.setTrackCacheMaxTracks(TRACK_CACHE_LIMIT_OPTIONS[1]);

			expect(await store.fetchString('track_cache_max_tracks')).toBe(
				String(TRACK_CACHE_LIMIT_OPTIONS[1]),
			);
		});

		it('ignores disallowed value', async () => {
			const store = new InMemoryPreferencesStore();
			const preferences = new Preferences(store);

			await preferences.setTrackCacheMaxTracks(999);

			await expectAsync(store.fetchString('track_cache_max_tracks')).toBeRejected();
		});
	});
});
