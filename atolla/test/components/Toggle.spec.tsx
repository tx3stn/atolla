import 'jasmine/src/jasmine';
import { theme } from 'atolla/src/theme';
import { Toggle } from 'atolla/src/ui/components/Toggle';
import { componentGetElements } from 'foundation/test/util/componentGetElements';
import { elementTypeFind } from 'foundation/test/util/elementTypeFind';
import { IRenderedElementViewClass } from 'valdi_test/test/IRenderedElementViewClass';
import { valdiIt } from 'valdi_test/test/JSXTestUtils';
import { styleAttribute, touchEvent } from '../util/testEvents';

describe('Toggle', () => {
	valdiIt('calls onToggle with true when tapped while disabled', async (driver) => {
		let received: boolean | undefined;
		const viewModel = {
			enabled: false,
			onToggle: (enabled: boolean) => {
				received = enabled;
			},
		};
		const component = driver.renderComponent(Toggle, viewModel, undefined);

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		views[0].getAttribute('onTap')?.(touchEvent);

		expect(received).toBe(true);
	});

	valdiIt('calls onToggle with false when tapped while enabled', async (driver) => {
		let received: boolean | undefined;
		const viewModel = {
			enabled: true,
			onToggle: (enabled: boolean) => {
				received = enabled;
			},
		};
		const component = driver.renderComponent(Toggle, viewModel, undefined);

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		views[0].getAttribute('onTap')?.(touchEvent);

		expect(received).toBe(false);
	});

	valdiIt('uses accent color for track when enabled', async (driver) => {
		const viewModel = {
			enabled: true,
			onToggle: () => {},
		};
		const component = driver.renderComponent(Toggle, viewModel, undefined);

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		expect(styleAttribute(views[0], 'backgroundColor')).toBe(theme.colors.active);
	});

	valdiIt('uses muted color for track when disabled', async (driver) => {
		const viewModel = {
			enabled: false,
			onToggle: () => {},
		};
		const component = driver.renderComponent(Toggle, viewModel, undefined);

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		expect(styleAttribute(views[0], 'backgroundColor')).toBe(theme.colors.bgAccent);
	});

	valdiIt('sets accessibilityLabel on the track', async (driver) => {
		const viewModel = {
			accessibilityId: 'settings-animations-toggle',
			enabled: false,
			onToggle: () => {},
		};
		const component = driver.renderComponent(Toggle, viewModel, undefined);

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		expect(views[0].getAttribute('accessibilityLabel')).toBe('settings-animations-toggle');
	});
});
