import 'jasmine/src/jasmine';
import { CardSizes, ConnectionModes } from 'atolla_app/src/models/App';
import {
	CARD_SIZE_OPTIONS,
	DEFAULT_CARD_SIZE,
	DEFAULT_TRACK_CACHE_MAX_TRACKS,
	Preferences,
	TRACK_CACHE_LIMIT_OPTIONS,
} from 'atolla_app/src/stores/Preferences';
import { DEFAULT_LANGUAGE } from 'atolla_core/src/Language';
import { InMemoryKeyValueStore } from 'atolla_core/src/stores/KeyValueStore';

describe('Preferences', () => {
	describe('getCardSize()', () => {
		it('returns default when preference is missing', async () => {
			const preferences = new Preferences(new InMemoryKeyValueStore());

			expect(await preferences.getCardSize()).toBe(DEFAULT_CARD_SIZE);
		});

		it('returns default when stored value is invalid', async () => {
			const store = new InMemoryKeyValueStore();
			await store.storeString('card_size', 'enormous');
			const preferences = new Preferences(store);

			expect(await preferences.getCardSize()).toBe(DEFAULT_CARD_SIZE);
		});

		it('returns stored value when allowed', async () => {
			const store = new InMemoryKeyValueStore();
			await store.storeString('card_size', CARD_SIZE_OPTIONS[1]);
			const preferences = new Preferences(store);

			expect(await preferences.getCardSize()).toBe(CARD_SIZE_OPTIONS[1]);
		});
	});

	describe('setCardSize()', () => {
		it('stores allowed value', async () => {
			const store = new InMemoryKeyValueStore();
			const preferences = new Preferences(store);

			await preferences.setCardSize(CARD_SIZE_OPTIONS[1]);

			expect(await store.fetchString('card_size')).toBe(CARD_SIZE_OPTIONS[1]);
		});

		it('ignores disallowed value', async () => {
			const store = new InMemoryKeyValueStore();
			const preferences = new Preferences(store);

			await preferences.setCardSize('enormous' as never);

			await expectAsync(store.fetchString('card_size')).toBeRejected();
		});
	});

	// the arithmetic itself is covered by GridColumns.test.ts; these cover the wiring, that the getter
	// actually reads the selected card size and the window width it was constructed with
	describe('gridColumns', () => {
		it('reports more columns for the smaller card size', async () => {
			const preferences = new Preferences(new InMemoryKeyValueStore(), 393);

			await preferences.setCardSize(CardSizes.regular);
			const regularColumns = preferences.gridColumns;
			await preferences.setCardSize(CardSizes.small);

			expect(preferences.gridColumns).toBeGreaterThan(regularColumns);
		});

		it('reports more columns on a wider window at the same card size', () => {
			const phone = new Preferences(new InMemoryKeyValueStore(), 393);
			const tablet = new Preferences(new InMemoryKeyValueStore(), 1024);

			expect(tablet.gridColumns).toBeGreaterThan(phone.gridColumns);
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

	describe('getDownloadOnWifiOnly()', () => {
		it('returns false when preference is missing', async () => {
			const preferences = new Preferences(new InMemoryKeyValueStore());

			expect(await preferences.getDownloadOnWifiOnly()).toBe(false);
		});

		it('returns true only when stored value is the string "true"', async () => {
			const store = new InMemoryKeyValueStore();
			await store.storeString('download_on_wifi_only', 'true');
			const preferences = new Preferences(store);

			expect(await preferences.getDownloadOnWifiOnly()).toBe(true);
		});
	});

	describe('setDownloadOnWifiOnly()', () => {
		it('persists and exposes the value synchronously', async () => {
			const store = new InMemoryKeyValueStore();
			const preferences = new Preferences(store);

			await preferences.setDownloadOnWifiOnly(true);

			expect(preferences.downloadOnWifiOnly).toBe(true);
			expect(await store.fetchString('download_on_wifi_only')).toBe('true');
		});

		it('notifies subscribers when the value changes', async () => {
			const preferences = new Preferences(new InMemoryKeyValueStore());
			let notified = 0;
			preferences.subscribe(() => notified++);

			await preferences.setDownloadOnWifiOnly(true);

			expect(notified).toBe(1);
		});

		it('does not notify when the value is unchanged', async () => {
			const preferences = new Preferences(new InMemoryKeyValueStore());
			await preferences.setDownloadOnWifiOnly(true);
			let notified = 0;
			preferences.subscribe(() => notified++);

			await preferences.setDownloadOnWifiOnly(true);

			expect(notified).toBe(0);
		});

		it('hydrates from the store on load()', async () => {
			const store = new InMemoryKeyValueStore();
			await store.storeString('download_on_wifi_only', 'true');
			const preferences = new Preferences(store);

			await preferences.load();

			expect(preferences.downloadOnWifiOnly).toBe(true);
		});
	});

	describe('setIncludeLyricsInDownloads()', () => {
		it('defaults to off so downloads do not fetch lyrics unasked', () => {
			const preferences = new Preferences(new InMemoryKeyValueStore());

			expect(preferences.includeLyricsInDownloads).toBe(false);
		});

		it('persists and exposes the value synchronously', async () => {
			const store = new InMemoryKeyValueStore();
			const preferences = new Preferences(store);

			await preferences.setIncludeLyricsInDownloads(true);

			expect(preferences.includeLyricsInDownloads).toBe(true);
			expect(await store.fetchString('include_lyrics_in_downloads')).toBe('true');
		});

		it('notifies subscribers when the value changes', async () => {
			const preferences = new Preferences(new InMemoryKeyValueStore());
			let notified = 0;
			preferences.subscribe(() => notified++);

			await preferences.setIncludeLyricsInDownloads(true);

			expect(notified).toBe(1);
		});

		it('does not notify when the value is unchanged', async () => {
			const preferences = new Preferences(new InMemoryKeyValueStore());
			await preferences.setIncludeLyricsInDownloads(true);
			let notified = 0;
			preferences.subscribe(() => notified++);

			await preferences.setIncludeLyricsInDownloads(true);

			expect(notified).toBe(0);
		});

		it('hydrates from the store on load()', async () => {
			const store = new InMemoryKeyValueStore();
			await store.storeString('include_lyrics_in_downloads', 'true');
			const preferences = new Preferences(store);

			await preferences.load();

			expect(preferences.includeLyricsInDownloads).toBe(true);
		});
	});

	describe('observable layer', () => {
		it('exposes defaults synchronously before load', () => {
			const preferences = new Preferences(new InMemoryKeyValueStore());

			expect(preferences.cardSize).toBe(DEFAULT_CARD_SIZE);
			expect(preferences.language).toBe(DEFAULT_LANGUAGE);
			expect(preferences.animationsEnabled).toBe(true);
			expect(preferences.mode).toBe(ConnectionModes.offline);
		});

		it('hydrates in-memory values from the store on load()', async () => {
			const store = new InMemoryKeyValueStore();
			await store.storeString('card_size', CARD_SIZE_OPTIONS[1]);
			await store.storeString('language', 'fr');
			await store.storeString('navigation_animations_enabled', 'false');
			await store.storeString('mode', ConnectionModes.online);
			const preferences = new Preferences(store);

			await preferences.load();

			expect(preferences.cardSize).toBe(CARD_SIZE_OPTIONS[1]);
			expect(preferences.language).toBe('fr');
			expect(preferences.animationsEnabled).toBe(false);
			expect(preferences.mode).toBe(ConnectionModes.online);
		});

		it('updates the in-memory value synchronously on set and persists', async () => {
			const store = new InMemoryKeyValueStore();
			const preferences = new Preferences(store);

			await preferences.setCardSize(CARD_SIZE_OPTIONS[1]);

			expect(preferences.cardSize).toBe(CARD_SIZE_OPTIONS[1]);
			expect(await store.fetchString('card_size')).toBe(CARD_SIZE_OPTIONS[1]);
		});

		it('keeps the in-memory value unchanged when set is given a disallowed value', async () => {
			const preferences = new Preferences(new InMemoryKeyValueStore());

			await preferences.setCardSize('enormous' as never);

			expect(preferences.cardSize).toBe(DEFAULT_CARD_SIZE);
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
			await preferences.setCardSize(CARD_SIZE_OPTIONS[1]);

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

	// every screen view subscribes and re-reads the getters, so a notify for a value that did not
	// change re-renders the whole settings tree for nothing
	describe('notify deduplication', () => {
		it('does not notify when the card size is unchanged', async () => {
			const preferences = new Preferences(new InMemoryKeyValueStore());
			await preferences.setCardSize(CARD_SIZE_OPTIONS[1]);
			let notified = 0;
			preferences.subscribe(() => notified++);

			await preferences.setCardSize(CARD_SIZE_OPTIONS[1]);

			expect(notified).toBe(0);
		});

		it('notifies when the card size actually changes', async () => {
			const preferences = new Preferences(new InMemoryKeyValueStore());
			await preferences.setCardSize(CARD_SIZE_OPTIONS[1]);
			let notified = 0;
			preferences.subscribe(() => notified++);

			await preferences.setCardSize(CARD_SIZE_OPTIONS[0]);

			expect(notified).toBe(1);
		});

		it('does not notify when the language is unchanged', async () => {
			const preferences = new Preferences(new InMemoryKeyValueStore());
			await preferences.setLanguage(DEFAULT_LANGUAGE);
			let notified = 0;
			preferences.subscribe(() => notified++);

			await preferences.setLanguage(DEFAULT_LANGUAGE);

			expect(notified).toBe(0);
		});

		it('does not notify when animations enabled is unchanged', async () => {
			const preferences = new Preferences(new InMemoryKeyValueStore());
			await preferences.setAnimationsEnabled(false);
			let notified = 0;
			preferences.subscribe(() => notified++);

			await preferences.setAnimationsEnabled(false);

			expect(notified).toBe(0);
		});

		// re-selecting the current mode on a fresh install still flips hasStoredMode, which the
		// cold-start launch decision reads — that is a real change even though the mode matches
		it('notifies when re-setting the current mode first persists it', async () => {
			const preferences = new Preferences(new InMemoryKeyValueStore());
			await preferences.load();
			let notified = 0;
			preferences.subscribe(() => notified++);

			await preferences.setMode(preferences.mode);

			expect(preferences.hasStoredMode).toBe(true);
			expect(notified).toBe(1);
		});

		it('does not notify when the mode is already stored and unchanged', async () => {
			const preferences = new Preferences(new InMemoryKeyValueStore());
			await preferences.setMode(ConnectionModes.offline);
			let notified = 0;
			preferences.subscribe(() => notified++);

			await preferences.setMode(ConnectionModes.offline);

			expect(notified).toBe(0);
		});

		// the write stays unconditional: a value equal to the in-memory default may never have been
		// persisted, so skipping it would leave disk and memory disagreeing
		it('still persists a value that is unchanged in memory', async () => {
			const store = new InMemoryKeyValueStore();
			const preferences = new Preferences(store);

			await preferences.setCardSize(DEFAULT_CARD_SIZE);

			expect(await store.fetchString('card_size')).toBe(DEFAULT_CARD_SIZE);
		});
	});
});
