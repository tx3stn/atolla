import 'jasmine/src/jasmine';
import { Button } from 'atolla/src/ui/components/Button';
import { componentGetElements } from 'foundation/test/util/componentGetElements';
import { elementTypeFind } from 'foundation/test/util/elementTypeFind';
import { IRenderedElementViewClass } from 'valdi_test/test/IRenderedElementViewClass';
import { createComponent, valdiIt } from 'valdi_test/test/JSXTestUtils';
import { touchEvent } from '../util/testEvents';

describe('Button', () => {
	valdiIt('calls onTap when tapped', async () => {
		let called = false;
		const instrumented = createComponent(Button, {
			accessibilityId: 'test-button',
			label: 'tap me',
			onTap: () => {
				called = true;
			},
		});
		const component = instrumented.getComponent();

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		views
			.find((v) => v.getAttribute('accessibilityLabel') === 'test-button-btn')
			?.getAttribute('onTap')?.(touchEvent);

		expect(called).toBe(true);
	});

	valdiIt('does not call onTap when disabled', async () => {
		let called = false;
		const instrumented = createComponent(Button, {
			accessibilityId: 'test-button',
			enabled: false,
			label: 'tap me',
			onTap: () => {
				called = true;
			},
		});
		const component = instrumented.getComponent();

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const button = views.find((v) => v.getAttribute('accessibilityLabel') === 'test-button-btn');
		button?.getAttribute('onTap')?.(touchEvent);

		expect(button?.getAttribute('onTap')).toBeUndefined();
		expect(called).toBe(false);
	});

	valdiIt('renders the provided label', async () => {
		const instrumented = createComponent(Button, {
			accessibilityId: 'test-button',
			label: 'tap me',
			onTap: () => {},
		});
		const component = instrumented.getComponent();

		const labels = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.Label,
		);

		expect(labels.map((label) => label.getAttribute('value'))).toContain('tap me');
	});
});
