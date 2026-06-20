import 'jasmine/src/jasmine';
import { theme } from 'atolla/src/theme';
import { FooterIcon } from 'atolla/src/ui/components/FooterIcon';
import { componentGetElements } from 'foundation/test/util/componentGetElements';
import { elementTypeFind } from 'foundation/test/util/elementTypeFind';
import { IRenderedElementViewClass } from 'valdi_test/test/IRenderedElementViewClass';
import { valdiIt } from 'valdi_test/test/JSXTestUtils';
import { touchEvent } from '../util/testEvents';

const icon = 'some-icon-source';

describe('FooterIcon', () => {
	valdiIt('calls action when tapped', async (driver) => {
		let called = false;
		const viewModel = {
			action: () => {
				called = true;
			},
			icon,
		};
		const component = driver.renderComponent(FooterIcon, viewModel, undefined);

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		views[0].getAttribute('onTap')?.(touchEvent);

		expect(called).toBe(true);
	});

	valdiIt('applies no tint when active is true', async (driver) => {
		const viewModel = {
			action: () => {},
			active: true,
			icon,
		};
		const component = driver.renderComponent(FooterIcon, viewModel, undefined);

		const images = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.Image,
		);
		expect(images[0].getAttribute('tint')).toBe(undefined);
	});

	valdiIt('applies grey tint when not active', async (driver) => {
		const viewModel = {
			action: () => {},
			active: false,
			icon,
		};
		const component = driver.renderComponent(FooterIcon, viewModel, undefined);

		const images = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.Image,
		);
		expect(images[0].getAttribute('tint')).toBe(theme.colors.grey);
	});

	valdiIt('applies activeColor when active', async (driver) => {
		const viewModel = {
			action: () => {},
			active: true,
			activeColor: '#abcdef',
			icon,
		};
		const component = driver.renderComponent(FooterIcon, viewModel, undefined);

		const images = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.Image,
		);
		expect(images[0].getAttribute('tint')).toBe('#abcdef');
	});

	valdiIt('applies inactiveColor when not active', async (driver) => {
		const viewModel = {
			action: () => {},
			active: false,
			icon,
			inactiveColor: '#123456',
		};
		const component = driver.renderComponent(FooterIcon, viewModel, undefined);

		const images = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.Image,
		);
		expect(images[0].getAttribute('tint')).toBe('#123456');
	});

	valdiIt('sets accessibilityLabel on the tap target', async (driver) => {
		const viewModel = {
			accessibilityId: 'footer-library',
			action: () => {},
			icon,
		};
		const component = driver.renderComponent(FooterIcon, viewModel, undefined);

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		expect(views[0].getAttribute('accessibilityLabel')).toBe('footer-library');
	});

	valdiIt('renders badge count when badgeCount is positive', async (driver) => {
		const viewModel = {
			action: () => {},
			badgeCount: 3,
			icon,
		};
		const component = driver.renderComponent(FooterIcon, viewModel, undefined);

		const labels = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.Label,
		);
		expect(labels.map((label) => label.getAttribute('value'))).toContain('3');
	});

	valdiIt('does not render badge when badgeCount is zero', async (driver) => {
		const viewModel = {
			action: () => {},
			badgeCount: 0,
			icon,
		};
		const component = driver.renderComponent(FooterIcon, viewModel, undefined);

		const labels = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.Label,
		);
		expect(labels.length).toBe(0);
	});
});
