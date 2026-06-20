import 'jasmine/src/jasmine';
import { Toast } from 'atolla/src/ui/components/Toast';
import { componentGetElements } from 'foundation/test/util/componentGetElements';
import { elementTypeFind } from 'foundation/test/util/elementTypeFind';
import { IRenderedElementViewClass } from 'valdi_test/test/IRenderedElementViewClass';
import { valdiIt } from 'valdi_test/test/JSXTestUtils';

describe('Toast', () => {
	valdiIt('renders the message', async (driver) => {
		const viewModel = { message: 'Cache cleared' };
		const component = driver.renderComponent(Toast, viewModel, undefined);

		const labels = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.Label,
		);
		const values = labels.map((label) => label.getAttribute('value'));

		expect(values).toContain('Cache cleared');
	});

	valdiIt('renders with accessibilityLabel toast', async (driver) => {
		const viewModel = { message: 'Cache cleared' };
		const component = driver.renderComponent(Toast, viewModel, undefined);

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const toast = views.find((view) => view.getAttribute('accessibilityLabel') === 'toast');

		expect(toast).toBeTruthy();
	});
});
