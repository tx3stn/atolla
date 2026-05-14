import 'jasmine/src/jasmine';
import { theme } from 'atolla/src/theme';
import { FooterIcon } from 'atolla/src/ui/components/FooterIcon';
import { componentGetElements } from 'foundation/test/util/componentGetElements';
import { elementTypeFind } from 'foundation/test/util/elementTypeFind';
import { IRenderedElementViewClass } from 'valdi_test/test/IRenderedElementViewClass';
import { createComponent, valdiIt } from 'valdi_test/test/JSXTestUtils';

const icon = 'some-icon-source';

describe('FooterIcon', () => {
	valdiIt('calls action when tapped', async () => {
		let called = false;
		const instrumented = createComponent(FooterIcon, {
			action: () => {
				called = true;
			},
			icon,
		});
		const component = instrumented.getComponent();

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		views[0].getAttribute('onTap')?.();

		expect(called).toBe(true);
	});

	valdiIt('applies no tint when active is true', async () => {
		const instrumented = createComponent(FooterIcon, {
			action: () => {},
			active: true,
			icon,
		});
		const component = instrumented.getComponent();

		const images = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.Image,
		);
		expect(images[0].getAttribute('tint')).toBe(undefined);
	});

	valdiIt('applies grey tint when not active', async () => {
		const instrumented = createComponent(FooterIcon, {
			action: () => {},
			active: false,
			icon,
		});
		const component = instrumented.getComponent();

		const images = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.Image,
		);
		expect(images[0].getAttribute('tint')).toBe(theme.colors.grey);
	});

	valdiIt('sets accessibilityLabel on the tap target', async () => {
		const instrumented = createComponent(FooterIcon, {
			accessibilityId: 'footer-library',
			action: () => {},
			icon,
		});
		const component = instrumented.getComponent();

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		expect(views[0].getAttribute('accessibilityLabel')).toBe('footer-library');
	});

	valdiIt('renders badge count when badgeCount is positive', async () => {
		const instrumented = createComponent(FooterIcon, {
			action: () => {},
			badgeCount: 3,
			icon,
		});
		const component = instrumented.getComponent();

		const labels = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.Label,
		);
		expect(labels.map((label) => label.getAttribute('value'))).toContain('3');
	});

	valdiIt('does not render badge when badgeCount is zero', async () => {
		const instrumented = createComponent(FooterIcon, {
			action: () => {},
			badgeCount: 0,
			icon,
		});
		const component = instrumented.getComponent();

		const labels = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.Label,
		);
		expect(labels.length).toBe(0);
	});
});
