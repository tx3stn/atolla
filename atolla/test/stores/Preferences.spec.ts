// @ts-nocheck
import 'jasmine/src/jasmine';
import {
	DEFAULT_GRID_COLUMNS,
	DEFAULT_TRACK_CACHE_MAX_TRACKS,
	GRID_COLUMN_OPTIONS,
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
	describe('getGridColumns()', () => {
		it('returns default when preference is missing', async () => {
			const preferences = new Preferences(new InMemoryPreferencesStore());

			expect(await preferences.getGridColumns()).toBe(DEFAULT_GRID_COLUMNS);
		});

		it('returns default when stored value is invalid', async () => {
			const store = new InMemoryPreferencesStore();
			await store.storeString('grid_columns', '999');
			const preferences = new Preferences(store);

			expect(await preferences.getGridColumns()).toBe(DEFAULT_GRID_COLUMNS);
		});

		it('returns stored value when allowed', async () => {
			const store = new InMemoryPreferencesStore();
			await store.storeString('grid_columns', String(GRID_COLUMN_OPTIONS[1]));
			const preferences = new Preferences(store);

			expect(await preferences.getGridColumns()).toBe(GRID_COLUMN_OPTIONS[1]);
		});
	});

	describe('setGridColumns()', () => {
		it('stores allowed value', async () => {
			const store = new InMemoryPreferencesStore();
			const preferences = new Preferences(store);

			await preferences.setGridColumns(GRID_COLUMN_OPTIONS[1]);

			expect(await store.fetchString('grid_columns')).toBe(String(GRID_COLUMN_OPTIONS[1]));
		});

		it('ignores disallowed value', async () => {
			const store = new InMemoryPreferencesStore();
			const preferences = new Preferences(store);

			await preferences.setGridColumns(6);

			await expectAsync(store.fetchString('grid_columns')).toBeRejected();
		});
	});

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

	describe('getJellyfinClientDeviceIdOverride()', () => {
		it('returns empty string when preference is missing', async () => {
			const preferences = new Preferences(new InMemoryPreferencesStore());

			expect(await preferences.getJellyfinClientDeviceIdOverride()).toBe('');
		});

		it('returns trimmed value when override exists', async () => {
			const store = new InMemoryPreferencesStore();
			await store.storeString('jellyfin_client_device_id_override', '  profile-a-device  ');
			const preferences = new Preferences(store);

			expect(await preferences.getJellyfinClientDeviceIdOverride()).toBe('profile-a-device');
		});
	});

	describe('setJellyfinClientDeviceIdOverride()', () => {
		it('stores trimmed override value', async () => {
			const store = new InMemoryPreferencesStore();
			const preferences = new Preferences(store);

			await preferences.setJellyfinClientDeviceIdOverride('  custom-device  ');

			expect(await store.fetchString('jellyfin_client_device_id_override')).toBe('custom-device');
		});

		it('stores empty string when override is cleared', async () => {
			const store = new InMemoryPreferencesStore();
			const preferences = new Preferences(store);

			await preferences.setJellyfinClientDeviceIdOverride('');

			expect(await store.fetchString('jellyfin_client_device_id_override')).toBe('');
		});
	});
});
