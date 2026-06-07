import 'jasmine/src/jasmine';
import { ModalActionButton } from 'atolla/src/ui/components/ModalActionButton';
import { elementTypeFind } from 'foundation/test/util/elementTypeFind';
import { IRenderedElementViewClass } from 'valdi_test/test/IRenderedElementViewClass';
import { createComponent, valdiIt } from 'valdi_test/test/JSXTestUtils';
import { renderedElements } from './renderedElements';

describe('ModalActionButton', () => {
	valdiIt('renders the label', async () => {
		const instrumented = createComponent(ModalActionButton, {
			accessibilityId: 'modal-confirm',
			animationsEnabled: false,
			label: 'yes',
			onPress: () => {},
		});
		const component = instrumented.getComponent();

		const labels = elementTypeFind(renderedElements(component), IRenderedElementViewClass.Label);

		expect(labels.length).toBe(1);
		expect(labels[0].getAttribute('value')).toBe('yes');
	});

	valdiIt('fires onPress synchronously when animations are disabled', async () => {
		let presses = 0;
		const instrumented = createComponent(ModalActionButton, {
			accessibilityId: 'modal-confirm',
			animationsEnabled: false,
			label: 'yes',
			onPress: () => {
				presses += 1;
			},
		});
		const component = instrumented.getComponent();

		const views = elementTypeFind(renderedElements(component), IRenderedElementViewClass.View);
		const button = views.find(
			(view) => view.getAttribute('accessibilityLabel') === 'modal-confirm',
		);
		button?.getAttribute('onTap')?.();

		expect(presses).toBe(1);
	});

	valdiIt('renders a ripple overlay for the press animation', async () => {
		const instrumented = createComponent(ModalActionButton, {
			accessibilityId: 'modal-confirm',
			animationsEnabled: true,
			label: 'yes',
			onPress: () => {},
		});
		const component = instrumented.getComponent();

		const views = elementTypeFind(renderedElements(component), IRenderedElementViewClass.View);

		// Root button view plus the absolutely positioned ripple overlay.
		expect(views.length).toBe(2);
	});
});
