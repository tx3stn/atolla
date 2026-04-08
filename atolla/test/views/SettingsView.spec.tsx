// @ts-nocheck
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
	valdiIt('renders cache section title and clear cache label', () => {
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

	valdiIt('renders clear cache button with accessibility labels', () => {
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
		expect(clearCacheButton?.getAttribute('contentDescription')).toBe('settings-cache-clear-btn');
		expect(typeof clearCacheButton?.getAttribute('onTap')).toBe('function');
	});

	valdiIt('calls onLogout when logout button is tapped', () => {
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
			.find((view) => view.getAttribute('accessibilityLabel') === 'settings-logout-btn')
			?.getAttribute('onTap')?.();

		expect(called).toBe(true);
	});

	valdiIt('tapping clear cache button shows the cache clear modal', () => {
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

	valdiIt('calls onClearCache with selection when modal is confirmed', () => {
		let received: ClearCacheSelection | undefined;
		const instrumented = createComponent(SettingsView, {
			onClearCache: (selection) => {
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
			playlistImage: true,
			tracks: true,
		});
	});

	valdiIt('shows toast after confirming cache clear', () => {
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

	valdiIt('shows cached tracks dropdown options when tapped', () => {
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

	valdiIt('calls onTrackCacheMaxTracksChange when selecting a cached tracks option', () => {
		let selected = 0;
		const instrumented = createComponent(SettingsView, {
			onTrackCacheMaxTracksChange: (count) => {
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

	valdiIt('shows grid columns options when tapped', () => {
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

	valdiIt('calls onGridColumnsChange when selecting a grid columns option', () => {
		let selected = 0;
		const instrumented = createComponent(SettingsView, {
			gridColumns: 3,
			onGridColumnsChange: (count) => {
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

	valdiIt('does not call onClearCache when modal is cancelled', () => {
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
});
