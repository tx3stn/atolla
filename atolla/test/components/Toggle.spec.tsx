import 'jasmine/src/jasmine';
import { theme } from 'atolla/src/theme';
import { Toggle } from 'atolla/src/ui/components/Toggle';
import { componentGetElements } from 'foundation/test/util/componentGetElements';
import { elementTypeFind } from 'foundation/test/util/elementTypeFind';
import { IRenderedElementViewClass } from 'valdi_test/test/IRenderedElementViewClass';
import { createComponent, valdiIt } from 'valdi_test/test/JSXTestUtils';

describe('Toggle', () => {
	valdiIt('calls onToggle with true when tapped while disabled', async () => {
		let received: boolean | undefined;
		const instrumented = createComponent(Toggle, {
			enabled: false,
			onToggle: (enabled: boolean) => {
				received = enabled;
			},
		});
		const component = instrumented.getComponent();

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		views[0].getAttribute('onTap')?.();

		expect(received).toBe(true);
	});

	valdiIt('calls onToggle with false when tapped while enabled', async () => {
		let received: boolean | undefined;
		const instrumented = createComponent(Toggle, {
			enabled: true,
			onToggle: (enabled: boolean) => {
				received = enabled;
			},
		});
		const component = instrumented.getComponent();

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		views[0].getAttribute('onTap')?.();

		expect(received).toBe(false);
	});

	valdiIt('uses accent color for track when enabled', async () => {
		const instrumented = createComponent(Toggle, {
			enabled: true,
			onToggle: () => {},
		});
		const component = instrumented.getComponent();

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		expect(views[0].getAttribute('style').attributes.backgroundColor).toBe(theme.colors.active);
	});

	valdiIt('uses muted color for track when disabled', async () => {
		const instrumented = createComponent(Toggle, {
			enabled: false,
			onToggle: () => {},
		});
		const component = instrumented.getComponent();

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		expect(views[0].getAttribute('style').attributes.backgroundColor).toBe(theme.colors.bgAccent);
	});

	valdiIt('sets accessibilityLabel on the track', async () => {
		const instrumented = createComponent(Toggle, {
			accessibilityId: 'settings-animations-toggle',
			enabled: false,
			onToggle: () => {},
		});
		const component = instrumented.getComponent();

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		expect(views[0].getAttribute('accessibilityLabel')).toBe('settings-animations-toggle');
	});
});
