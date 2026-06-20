import 'jasmine/src/jasmine';
import { LoopingArrowSpinner } from 'atolla/src/ui/components/LoopingArrowSpinner';
import { componentGetElements } from 'foundation/test/util/componentGetElements';
import { elementTypeFind } from 'foundation/test/util/elementTypeFind';
import { IRenderedElementViewClass } from 'valdi_test/test/IRenderedElementViewClass';
import { valdiIt } from 'valdi_test/test/JSXTestUtils';

describe('LoopingArrowSpinner', () => {
	valdiIt('renders default accessibility label', async (driver) => {
		const viewModel = {};
		const component = driver.renderComponent(LoopingArrowSpinner, viewModel, undefined);
		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const root = views.find((view) => view.getAttribute('accessibilityLabel') === 'spinner');
		expect(root).toBeTruthy();
	});

	valdiIt('renders provided label text', async (driver) => {
		const viewModel = {
			label: 'Searching library...',
		};
		const component = driver.renderComponent(LoopingArrowSpinner, viewModel, undefined);
		const labels = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.Label,
		);
		const values = labels.map((label) => label.getAttribute('value'));

		expect(values).toContain('Searching library...');
	});

	valdiIt('renders spinner image', async (driver) => {
		const viewModel = {};
		const component = driver.renderComponent(LoopingArrowSpinner, viewModel, undefined);
		const images = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.Image,
		);
		expect(images.length).toBe(1);
	});
});
