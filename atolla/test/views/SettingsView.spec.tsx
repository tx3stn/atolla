// @ts-nocheck
import 'jasmine/src/jasmine';
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
});
