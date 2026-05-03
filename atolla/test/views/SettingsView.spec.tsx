import 'jasmine/src/jasmine';
import type { ClearCacheSelection } from 'atolla/src/services/ImageCache';
import { Preferences } from 'atolla/src/stores/Preferences';
import { SettingsView } from 'atolla/src/ui/views/SettingsView';
import { componentGetElements } from 'foundation/test/util/componentGetElements';
import { elementTypeFind } from 'foundation/test/util/elementTypeFind';
import { IRenderedElementViewClass } from 'valdi_test/test/IRenderedElementViewClass';
import { createComponent, valdiIt } from 'valdi_test/test/JSXTestUtils';

function mockPreferences() {
	return new Preferences({
		fetchString: () => Promise.reject(new Error()),
		storeString: () => Promise.resolve(),
	});
}

describe('SettingsView', () => {
	valdiIt('renders cache section title and clear cache label', async () => {
		const instrumented = createComponent(SettingsView, {
			imageCacheMaxBytes: 2 * 1024 * 1024 * 1024,
			onCacheSizeChange: () => {},
			preferences: mockPreferences(),
		});
		const component = instrumented.getComponent();
		const labels = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.Label,
		);
		const values = labels.map((label) => label.getAttribute('value'));

		expect(values).toContain('CACHE');
		expect(values).toContain('clear cache');
	});

	valdiIt('renders clear cache button with accessibility labels', async () => {
		const instrumented = createComponent(SettingsView, {
			imageCacheMaxBytes: 2 * 1024 * 1024 * 1024,
			onCacheSizeChange: () => {},
			preferences: mockPreferences(),
		});
		const component = instrumented.getComponent();
		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const clearCacheButton = views.find(
			(view) => view.getAttribute('accessibilityLabel') === 'settings-cache-clear-btn',
		);

		expect(clearCacheButton).toBeTruthy();
		expect(typeof clearCacheButton?.getAttribute('onTap')).toBe('function');
	});

	valdiIt('tapping logout button shows the confirm modal', async () => {
		const instrumented = createComponent(SettingsView, {
			preferences: mockPreferences(),
		});
		const component = instrumented.getComponent();

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		views
			.find((v) => v.getAttribute('accessibilityLabel') === 'settings-logout-btn')
			?.getAttribute('onTap')?.();

		const modalConfirm = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.View,
		).find((v) => v.getAttribute('accessibilityLabel') === 'settings-logout-confirm-btn');

		expect(modalConfirm).toBeTruthy();
	});

	valdiIt('calls onLogout when logout confirm modal is confirmed', async () => {
		let called = false;
		const instrumented = createComponent(SettingsView, {
			onLogout: () => {
				called = true;
			},
			preferences: mockPreferences(),
		});
		const component = instrumented.getComponent();

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		views
			.find((v) => v.getAttribute('accessibilityLabel') === 'settings-logout-btn')
			?.getAttribute('onTap')?.();

		const modalViews = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.View,
		);
		modalViews
			.find((v) => v.getAttribute('accessibilityLabel') === 'settings-logout-confirm-btn')
			?.getAttribute('onTap')?.();

		expect(called).toBe(true);
	});

	valdiIt('does not call onLogout when logout confirm modal is cancelled', async () => {
		let called = false;
		const instrumented = createComponent(SettingsView, {
			onLogout: () => {
				called = true;
			},
			preferences: mockPreferences(),
		});
		const component = instrumented.getComponent();

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		views
			.find((v) => v.getAttribute('accessibilityLabel') === 'settings-logout-btn')
			?.getAttribute('onTap')?.();

		const modalViews = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.View,
		);
		modalViews
			.find((v) => v.getAttribute('accessibilityLabel') === 'settings-logout-cancel-btn')
			?.getAttribute('onTap')?.();

		expect(called).toBe(false);
	});

	valdiIt('tapping clear cache button shows the cache clear modal', async () => {
		const instrumented = createComponent(SettingsView, {
			preferences: mockPreferences(),
		});
		const component = instrumented.getComponent();

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		views
			.find((v) => v.getAttribute('accessibilityLabel') === 'settings-cache-clear-btn')
			?.getAttribute('onTap')?.();

		const updatedViews = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.View,
		);
		const modal = updatedViews.find(
			(v) => v.getAttribute('accessibilityLabel') === 'cache-clear-modal',
		);

		expect(modal).toBeTruthy();
	});

	valdiIt('calls onClearCache with selection when modal is confirmed', async () => {
		let received: ClearCacheSelection | undefined;
		const instrumented = createComponent(SettingsView, {
			onClearCache: (selection: ClearCacheSelection) => {
				received = selection;
			},
			preferences: mockPreferences(),
		});
		const component = instrumented.getComponent();

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		views
			.find((v) => v.getAttribute('accessibilityLabel') === 'settings-cache-clear-btn')
			?.getAttribute('onTap')?.();

		const modalViews = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.View,
		);
		modalViews
			.find((v) => v.getAttribute('accessibilityLabel') === 'cache-clear-confirm-btn')
			?.getAttribute('onTap')?.();

		expect(received).toEqual({
			albumArt: true,
			albumArtBlurred: true,
			artistImage: true,
			artistLogo: true,
			genreImage: true,
			playlistImage: true,
			tracks: true,
			waveformData: true,
		});
	});

	valdiIt('shows toast after confirming cache clear', async () => {
		const instrumented = createComponent(SettingsView, {
			onClearCache: () => {},
			preferences: mockPreferences(),
		});
		const component = instrumented.getComponent();

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		views
			.find((v) => v.getAttribute('accessibilityLabel') === 'settings-cache-clear-btn')
			?.getAttribute('onTap')?.();

		const modalViews = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.View,
		);
		modalViews
			.find((v) => v.getAttribute('accessibilityLabel') === 'cache-clear-confirm-btn')
			?.getAttribute('onTap')?.();

		const updatedViews = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.View,
		);
		const toast = updatedViews.find((v) => v.getAttribute('accessibilityLabel') === 'toast');

		expect(toast).toBeTruthy();
	});

	valdiIt('shows cached tracks dropdown options when tapped', async () => {
		const instrumented = createComponent(SettingsView, {
			preferences: mockPreferences(),
			trackCacheMaxTracks: 20,
		});
		const component = instrumented.getComponent();

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		views
			.find((v) => v.getAttribute('accessibilityLabel') === 'settings-track-cache-limit-dropdown')
			?.getAttribute('onTap')?.();

		const updatedViews = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.View,
		);
		const option = updatedViews.find(
			(v) => v.getAttribute('accessibilityLabel') === 'settings-track-cache-limit-option-25',
		);

		expect(option).toBeTruthy();
	});

	valdiIt('calls onTrackCacheMaxTracksChange when selecting a cached tracks option', async () => {
		let selected = 0;
		const instrumented = createComponent(SettingsView, {
			onTrackCacheMaxTracksChange: (count: number) => {
				selected = count;
			},
			preferences: mockPreferences(),
			trackCacheMaxTracks: 20,
		});
		const component = instrumented.getComponent();

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		views
			.find((v) => v.getAttribute('accessibilityLabel') === 'settings-track-cache-limit-dropdown')
			?.getAttribute('onTap')?.();

		const updatedViews = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.View,
		);
		updatedViews
			.find((v) => v.getAttribute('accessibilityLabel') === 'settings-track-cache-limit-option-30')
			?.getAttribute('onTap')?.();

		expect(selected).toBe(30);
	});

	valdiIt('shows grid columns options when tapped', async () => {
		const instrumented = createComponent(SettingsView, {
			gridColumns: 3,
			preferences: mockPreferences(),
		});
		const component = instrumented.getComponent();

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		views
			.find((v) => v.getAttribute('accessibilityLabel') === 'settings-grid-columns-dropdown')
			?.getAttribute('onTap')?.();

		const updatedViews = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.View,
		);
		const option = updatedViews.find(
			(v) => v.getAttribute('accessibilityLabel') === 'settings-grid-columns-option-4',
		);

		expect(option).toBeTruthy();
	});

	valdiIt('calls onGridColumnsChange when selecting a grid columns option', async () => {
		let selected = 0;
		const instrumented = createComponent(SettingsView, {
			gridColumns: 3,
			onGridColumnsChange: (count: number) => {
				selected = count;
			},
			preferences: mockPreferences(),
		});
		const component = instrumented.getComponent();

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		views
			.find((v) => v.getAttribute('accessibilityLabel') === 'settings-grid-columns-dropdown')
			?.getAttribute('onTap')?.();

		const updatedViews = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.View,
		);
		updatedViews
			.find((v) => v.getAttribute('accessibilityLabel') === 'settings-grid-columns-option-4')
			?.getAttribute('onTap')?.();

		expect(selected).toBe(4);
	});

	valdiIt('does not call onClearCache when modal is cancelled', async () => {
		let called = false;
		const instrumented = createComponent(SettingsView, {
			onClearCache: () => {
				called = true;
			},
			preferences: mockPreferences(),
		});
		const component = instrumented.getComponent();

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		views
			.find((v) => v.getAttribute('accessibilityLabel') === 'settings-cache-clear-btn')
			?.getAttribute('onTap')?.();

		const modalViews = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.View,
		);
		modalViews
			.find((v) => v.getAttribute('accessibilityLabel') === 'cache-clear-cancel-btn')
			?.getAttribute('onTap')?.();

		expect(called).toBe(false);
	});

	valdiIt('tapping delete all downloads button shows the confirm modal', async () => {
		const instrumented = createComponent(SettingsView, {
			preferences: mockPreferences(),
		});
		const component = instrumented.getComponent();

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		views
			.find((v) => v.getAttribute('accessibilityLabel') === 'settings-downloads-delete-all-btn')
			?.getAttribute('onTap')?.();

		const modalConfirm = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.View,
		).find((v) => v.getAttribute('accessibilityLabel') === 'settings-downloads-clear-confirm-btn');

		expect(modalConfirm).toBeTruthy();
	});

	valdiIt('calls onClearDownloads when downloads clear modal is confirmed', async () => {
		let called = false;
		const instrumented = createComponent(SettingsView, {
			onClearDownloads: () => {
				called = true;
			},
			preferences: mockPreferences(),
		});
		const component = instrumented.getComponent();

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		views
			.find((v) => v.getAttribute('accessibilityLabel') === 'settings-downloads-delete-all-btn')
			?.getAttribute('onTap')?.();

		const modalViews = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.View,
		);
		modalViews
			.find((v) => v.getAttribute('accessibilityLabel') === 'settings-downloads-clear-confirm-btn')
			?.getAttribute('onTap')?.();

		expect(called).toBe(true);
	});

	valdiIt('does not call onClearDownloads when downloads clear modal is cancelled', async () => {
		let called = false;
		const instrumented = createComponent(SettingsView, {
			onClearDownloads: () => {
				called = true;
			},
			preferences: mockPreferences(),
		});
		const component = instrumented.getComponent();

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		views
			.find((v) => v.getAttribute('accessibilityLabel') === 'settings-downloads-delete-all-btn')
			?.getAttribute('onTap')?.();

		const modalViews = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.View,
		);
		modalViews
			.find((v) => v.getAttribute('accessibilityLabel') === 'settings-downloads-clear-cancel-btn')
			?.getAttribute('onTap')?.();

		expect(called).toBe(false);
	});

	valdiIt('calls onJellyfinDeviceIdOverrideChange when auth device id input changes', async () => {
		const received: Array<string> = [];
		const instrumented = createComponent(SettingsView, {
			onJellyfinDeviceIdOverrideChange: (value: string) => {
				received.push(value);
			},
			preferences: mockPreferences(),
		});
		const component = instrumented.getComponent();
		const textFields = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.TextField,
		);

		textFields
			.find(
				(field) => field.getAttribute('accessibilityLabel') === 'settings-jellyfin-device-id-input',
			)
			?.getAttribute('onChange')?.('custom-profile-device');

		expect(received).toEqual(['custom-profile-device']);
	});

	valdiIt('does not render auth device id reset button', async () => {
		const instrumented = createComponent(SettingsView, {
			preferences: mockPreferences(),
		});
		const component = instrumented.getComponent();
		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const resetButton = views.find(
			(view) => view.getAttribute('accessibilityLabel') === 'settings-jellyfin-device-id-reset-btn',
		);

		expect(resetButton).toBeUndefined();
	});
});
