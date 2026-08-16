import 'jasmine/src/jasmine';
import { LoadingSpinner } from 'atolla_app/src/ui/animations/LoadingSpinner';
import { componentGetElements } from 'foundation/test/util/componentGetElements';
import { elementTypeFind } from 'foundation/test/util/elementTypeFind';
import { IRenderedElementViewClass } from 'valdi_test/test/IRenderedElementViewClass';
import { valdiIt } from 'valdi_test/test/JSXTestUtils';

function findAnimation(component: Parameters<typeof componentGetElements>[0]) {
	const animations = elementTypeFind(
		componentGetElements(component),
		IRenderedElementViewClass.AnimatedImage,
	);
	expect(animations.length).toBe(1);
	return animations[0];
}

describe('LoadingSpinner', () => {
	valdiIt('renders default accessibility label', async (driver) => {
		const viewModel = {};
		const component = driver.renderComponent(LoadingSpinner, viewModel, undefined);
		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const root = views.find((view) => view.getAttribute('accessibilityLabel') === 'spinner');

		expect(root).toBeTruthy();
	});

	valdiIt('renders the provided accessibility label', async (driver) => {
		const viewModel = { accessibilityId: 'detail-header-downloading-spinner' };
		const component = driver.renderComponent(LoadingSpinner, viewModel, undefined);
		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const root = views.find(
			(view) => view.getAttribute('accessibilityLabel') === 'detail-header-downloading-spinner',
		);

		expect(root).toBeTruthy();
	});

	valdiIt('advances and loops by default', async (driver) => {
		const viewModel = {};
		const component = driver.renderComponent(LoadingSpinner, viewModel, undefined);
		const animation = findAnimation(component);

		expect(animation.getAttribute('advanceRate')).toBe(1);
		expect(animation.getAttribute('loop')).toBe(true);
	});

	valdiIt('advances at the provided speed', async (driver) => {
		const viewModel = { speed: 3 };
		const component = driver.renderComponent(LoadingSpinner, viewModel, undefined);
		const animation = findAnimation(component);

		expect(animation.getAttribute('advanceRate')).toBe(3);
	});

	valdiIt('pauses without unmounting when not spinning', async (driver) => {
		const viewModel = { spinning: false };
		const component = driver.renderComponent(LoadingSpinner, viewModel, undefined);
		const animation = findAnimation(component);

		expect(animation.getAttribute('advanceRate')).toBe(0);
	});
});
