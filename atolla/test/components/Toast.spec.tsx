import 'jasmine/src/jasmine';
import { ToastTypes } from 'atolla/src/services/ToastService';
import { theme } from 'atolla/src/theme';
import { Toast } from 'atolla/src/ui/components/Toast';
import { componentGetElements } from 'foundation/test/util/componentGetElements';
import { elementTypeFind } from 'foundation/test/util/elementTypeFind';
import { IRenderedElementViewClass } from 'valdi_test/test/IRenderedElementViewClass';
import { valdiIt } from 'valdi_test/test/JSXTestUtils';
import { touchEvent } from '../util/testEvents';

const baseViewModel = {
	animationsEnabled: false,
	closing: false,
	onDismissed: () => {},
};

function labelValues(component: Parameters<typeof componentGetElements>[0]): Array<unknown> {
	const labels = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.Label);
	return labels.map((label) => label.getAttribute('value'));
}

describe('Toast', () => {
	valdiIt('renders a success message with the success-tinted icon', async (driver) => {
		const component = driver.renderComponent(
			Toast,
			{ ...baseViewModel, message: 'Added to playlist', variant: ToastTypes.success },
			undefined,
		);

		expect(labelValues(component)).toContain('Added to playlist');

		const images = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.Image,
		);
		expect(images.length).toBe(1);
		expect(images[0].getAttribute('tint')).toBe(theme.colors.success);
	});

	valdiIt('tints the icon with the destructive colour for errors', async (driver) => {
		const component = driver.renderComponent(
			Toast,
			{ ...baseViewModel, message: 'Something failed', variant: ToastTypes.error },
			undefined,
		);

		const images = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.Image,
		);
		expect(images[0].getAttribute('tint')).toBe(theme.colors.destructive);
	});

	valdiIt('shows a spinner instead of an icon for the progress variant', async (driver) => {
		const component = driver.renderComponent(
			Toast,
			{ ...baseViewModel, message: 'syncing 3 changes…', variant: ToastTypes.progress },
			undefined,
		);

		expect(labelValues(component)).toContain('syncing 3 changes…');

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const spinner = views.find(
			(view) => view.getAttribute('accessibilityLabel') === 'toast-spinner',
		);
		expect(spinner).toBeTruthy();
	});

	valdiIt('invokes onTap when the pill is tapped', async (driver) => {
		let tapped = false;
		const component = driver.renderComponent(
			Toast,
			{
				...baseViewModel,
				message: 'tap me',
				onTap: () => {
					tapped = true;
				},
				variant: ToastTypes.error,
			},
			undefined,
		);

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const pill = views.find((view) => view.getAttribute('accessibilityLabel') === 'toast');
		pill?.getAttribute('onTap')?.(touchEvent);

		expect(tapped).toBe(true);
	});
});
