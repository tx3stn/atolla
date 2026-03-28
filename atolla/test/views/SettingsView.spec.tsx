// @ts-nocheck
import 'jasmine/src/jasmine';
import type { ClearCacheSelection } from 'atolla/src/services/ImageCache';
import { Preferences } from 'atolla/src/stores/Preferences';
import { SettingsView } from 'atolla/src/ui/views/SettingsView';
import { componentGetElements } from 'foundation/test/util/componentGetElements';
import { elementTypeFind } from 'foundation/test/util/elementTypeFind';
import { IRenderedElementViewClass } from 'valdi_test/test/IRenderedElementViewClass';
import { createComponent, valdiIt } from 'valdi_test/test/JSXTestUtils';

describe('SettingsView', () => {
	valdiIt('renders cache section title and clear cache label', () => {
		const instrumented = createComponent(SettingsView, {
			imageCacheMaxBytes: 2 * 1024 * 1024 * 1024,
			onCacheSizeChange: () => {},
			preferences: new Preferences(),
		});
		const component = instrumented.getComponent();
		const labels = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.Label,
		);
		const values = labels.map((label) => label.getAttribute('value'));

		expect(values).toContain('CACHE');
		expect(values).toContain('Clear Cache');
	});

	valdiIt('renders clear cache button with accessibility labels', () => {
		const instrumented = createComponent(SettingsView, {
			imageCacheMaxBytes: 2 * 1024 * 1024 * 1024,
			onCacheSizeChange: () => {},
			preferences: new Preferences(),
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

	valdiIt('renders palette failure summary when provided', () => {
		const instrumented = createComponent(SettingsView, {
			paletteFailureSummary: 'Failures by reason -> palette_cache_miss: 9',
			paletteTotalCount: 33,
			preferences: new Preferences(),
		});
		const component = instrumented.getComponent();
		const labels = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.Label,
		);
		const values = labels.map((label) => label.getAttribute('value'));

		expect(values).toContain('Failures by reason -> palette_cache_miss: 9');
	});

	valdiIt('tapping clear cache button shows the cache clear modal', () => {
		const instrumented = createComponent(SettingsView, {
			preferences: new Preferences(),
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
		const modal = updatedViews.find((v) => v.getAttribute('testID') === 'cache-clear-modal');

		expect(modal).toBeTruthy();
	});

	valdiIt('calls onClearCache with selection when modal is confirmed', () => {
		let received: ClearCacheSelection | undefined;
		const instrumented = createComponent(SettingsView, {
			onClearCache: (selection) => {
				received = selection;
			},
			preferences: new Preferences(),
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
			.find((v) => v.getAttribute('testID') === 'cache-clear-confirm-btn')
			?.getAttribute('onTap')?.();

		expect(received).toEqual({
			albumArt: true,
			albumArtBlurred: true,
			artistImage: true,
			artistLogo: true,
			playlistImage: true,
		});
	});

	valdiIt('shows toast after confirming cache clear', () => {
		const instrumented = createComponent(SettingsView, {
			onClearCache: () => {},
			preferences: new Preferences(),
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
			.find((v) => v.getAttribute('testID') === 'cache-clear-confirm-btn')
			?.getAttribute('onTap')?.();

		const updatedViews = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.View,
		);
		const toast = updatedViews.find((v) => v.getAttribute('testID') === 'toast');

		expect(toast).toBeTruthy();
	});

	valdiIt('does not call onClearCache when modal is cancelled', () => {
		let called = false;
		const instrumented = createComponent(SettingsView, {
			onClearCache: () => {
				called = true;
			},
			preferences: new Preferences(),
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
			.find((v) => v.getAttribute('testID') === 'cache-clear-cancel-btn')
			?.getAttribute('onTap')?.();

		expect(called).toBe(false);
	});

	valdiIt('renders failure details button after completion with failures', () => {
		const instrumented = createComponent(SettingsView, {
			paletteFailureCount: 1,
			paletteFailureDetails: ['palette_cache_miss | image is not present in cache | https://x'],
			paletteProcessedCount: 33,
			paletteTotalCount: 33,
			preferences: new Preferences(),
		});
		const component = instrumented.getComponent();
		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const detailsButton = views.find(
			(view) => view.getAttribute('accessibilityLabel') === 'settings-palette-failure-details-btn',
		);

		expect(detailsButton).toBeTruthy();
		expect(detailsButton?.getAttribute('contentDescription')).toBe(
			'settings-palette-failure-details-btn',
		);
	});
});
