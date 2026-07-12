import 'jasmine/src/jasmine';
import { InMemoryKeyValueStore } from 'atolla/src/stores/KeyValueStore';
import {
	DEFAULT_GRID_COLUMNS,
	DEFAULT_LANGUAGE,
	DEFAULT_TRACK_CACHE_MAX_TRACKS,
	GRID_COLUMN_OPTIONS,
	Preferences,
	TRACK_CACHE_LIMIT_OPTIONS,
} from 'atolla/src/stores/Preferences';
import { ConnectionModes } from 'atolla/src/transports/Model';

describe('Preferences', () => {
	describe('getGridColumns()', () => {
		it('returns default when preference is missing', async () => {
			const preferences = new Preferences(new InMemoryKeyValueStore());

			expect(await preferences.getGridColumns()).toBe(DEFAULT_GRID_COLUMNS);
		});

		it('returns default when stored value is invalid', async () => {
			const store = new InMemoryKeyValueStore();
			await store.storeString('grid_columns', '999');
			const preferences = new Preferences(store);

			expect(await preferences.getGridColumns()).toBe(DEFAULT_GRID_COLUMNS);
		});

		it('returns stored value when allowed', async () => {
			const store = new InMemoryKeyValueStore();
			await store.storeString('grid_columns', String(GRID_COLUMN_OPTIONS[1]));
			const preferences = new Preferences(store);

			expect(await preferences.getGridColumns()).toBe(GRID_COLUMN_OPTIONS[1]);
		});
	});

	describe('setGridColumns()', () => {
		it('stores allowed value', async () => {
			const store = new InMemoryKeyValueStore();
			const preferences = new Preferences(store);

			await preferences.setGridColumns(GRID_COLUMN_OPTIONS[1]);

			expect(await store.fetchString('grid_columns')).toBe(String(GRID_COLUMN_OPTIONS[1]));
		});

		it('ignores disallowed value', async () => {
			const store = new InMemoryKeyValueStore();
			const preferences = new Preferences(store);

			await preferences.setGridColumns(6);

			await expectAsync(store.fetchString('grid_columns')).toBeRejected();
		});
	});

	describe('getTrackCacheMaxTracks()', () => {
		it('returns default when preference is missing', async () => {
			const preferences = new Preferences(new InMemoryKeyValueStore());

			expect(await preferences.getTrackCacheMaxTracks()).toBe(DEFAULT_TRACK_CACHE_MAX_TRACKS);
		});

		it('returns default when stored value is invalid', async () => {
			const store = new InMemoryKeyValueStore();
			await store.storeString('track_cache_max_tracks', '999');
			const preferences = new Preferences(store);

			expect(await preferences.getTrackCacheMaxTracks()).toBe(DEFAULT_TRACK_CACHE_MAX_TRACKS);
		});

		it('returns stored value when allowed', async () => {
			const store = new InMemoryKeyValueStore();
			await store.storeString('track_cache_max_tracks', String(TRACK_CACHE_LIMIT_OPTIONS[4]));
			const preferences = new Preferences(store);

			expect(await preferences.getTrackCacheMaxTracks()).toBe(TRACK_CACHE_LIMIT_OPTIONS[4]);
		});
	});

	describe('setTrackCacheMaxTracks()', () => {
		it('stores allowed value', async () => {
			const store = new InMemoryKeyValueStore();
			const preferences = new Preferences(store);

			await preferences.setTrackCacheMaxTracks(TRACK_CACHE_LIMIT_OPTIONS[1]);

			expect(await store.fetchString('track_cache_max_tracks')).toBe(
				String(TRACK_CACHE_LIMIT_OPTIONS[1]),
			);
		});

		it('ignores disallowed value', async () => {
			const store = new InMemoryKeyValueStore();
			const preferences = new Preferences(store);

			await preferences.setTrackCacheMaxTracks(999);

			await expectAsync(store.fetchString('track_cache_max_tracks')).toBeRejected();
		});
	});

	describe('getJellyfinClientDeviceIdOverride()', () => {
		it('returns empty string when preference is missing', async () => {
			const preferences = new Preferences(new InMemoryKeyValueStore());

			expect(await preferences.getJellyfinClientDeviceIdOverride()).toBe('');
		});

		it('returns trimmed value when override exists', async () => {
			const store = new InMemoryKeyValueStore();
			await store.storeString('jellyfin_client_device_id_override', '  profile-a-device  ');
			const preferences = new Preferences(store);

			expect(await preferences.getJellyfinClientDeviceIdOverride()).toBe('profile-a-device');
		});
	});

	describe('setJellyfinClientDeviceIdOverride()', () => {
		it('stores trimmed override value', async () => {
			const store = new InMemoryKeyValueStore();
			const preferences = new Preferences(store);

			await preferences.setJellyfinClientDeviceIdOverride('  custom-device  ');

			expect(await store.fetchString('jellyfin_client_device_id_override')).toBe('custom-device');
		});

		it('stores empty string when override is cleared', async () => {
			const store = new InMemoryKeyValueStore();
			const preferences = new Preferences(store);

			await preferences.setJellyfinClientDeviceIdOverride('');

			expect(await store.fetchString('jellyfin_client_device_id_override')).toBe('');
		});
	});

	describe('observable layer', () => {
		it('exposes defaults synchronously before load', () => {
			const preferences = new Preferences(new InMemoryKeyValueStore());

			expect(preferences.gridColumns).toBe(DEFAULT_GRID_COLUMNS);
			expect(preferences.language).toBe(DEFAULT_LANGUAGE);
			expect(preferences.animationsEnabled).toBe(true);
			expect(preferences.mode).toBe(ConnectionModes.offline);
		});

		it('hydrates in-memory values from the store on load()', async () => {
			const store = new InMemoryKeyValueStore();
			await store.storeString('grid_columns', String(GRID_COLUMN_OPTIONS[1]));
			await store.storeString('language', 'fr');
			await store.storeString('navigation_animations_enabled', 'false');
			await store.storeString('mode', ConnectionModes.online);
			const preferences = new Preferences(store);

			await preferences.load();

			expect(preferences.gridColumns).toBe(GRID_COLUMN_OPTIONS[1]);
			expect(preferences.language).toBe('fr');
			expect(preferences.animationsEnabled).toBe(false);
			expect(preferences.mode).toBe(ConnectionModes.online);
		});

		it('updates the in-memory value synchronously on set and persists', async () => {
			const store = new InMemoryKeyValueStore();
			const preferences = new Preferences(store);

			await preferences.setGridColumns(GRID_COLUMN_OPTIONS[1]);

			expect(preferences.gridColumns).toBe(GRID_COLUMN_OPTIONS[1]);
			expect(await store.fetchString('grid_columns')).toBe(String(GRID_COLUMN_OPTIONS[1]));
		});

		it('keeps the in-memory value unchanged when set is given a disallowed value', async () => {
			const preferences = new Preferences(new InMemoryKeyValueStore());

			await preferences.setGridColumns(999);

			expect(preferences.gridColumns).toBe(DEFAULT_GRID_COLUMNS);
		});

		it('notifies subscribers when a value changes', async () => {
			const preferences = new Preferences(new InMemoryKeyValueStore());
			let notifications = 0;
			preferences.subscribe(() => {
				notifications += 1;
			});

			await preferences.setLanguage('fr');

			expect(notifications).toBe(1);
			expect(preferences.language).toBe('fr');
		});

		it('stops notifying after unsubscribe', async () => {
			const preferences = new Preferences(new InMemoryKeyValueStore());
			let notifications = 0;
			const unsubscribe = preferences.subscribe(() => {
				notifications += 1;
			});

			unsubscribe();
			await preferences.setGridColumns(GRID_COLUMN_OPTIONS[1]);

			expect(notifications).toBe(0);
		});

		it('normalises and exposes the device-id override synchronously', async () => {
			const preferences = new Preferences(new InMemoryKeyValueStore());

			await preferences.setJellyfinClientDeviceIdOverride('  custom-device  ');

			expect(preferences.jellyfinClientDeviceIdOverride).toBe('custom-device');
		});
	});

	describe('hasStoredMode', () => {
		it('is false on a fresh install where no mode was ever persisted', async () => {
			const preferences = new Preferences(new InMemoryKeyValueStore());

			await preferences.load();

			expect(preferences.hasStoredMode).toBe(false);
		});

		it('is true after load when a mode has been persisted', async () => {
			const store = new InMemoryKeyValueStore();
			await store.storeString('mode', ConnectionModes.offline);
			const preferences = new Preferences(store);

			await preferences.load();

			expect(preferences.hasStoredMode).toBe(true);
		});

		it('flips to true synchronously once a mode is set', async () => {
			const preferences = new Preferences(new InMemoryKeyValueStore());

			await preferences.setMode(ConnectionModes.online);

			expect(preferences.hasStoredMode).toBe(true);
		});
	});
});
