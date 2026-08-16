import 'jasmine/src/jasmine';
import { LogoWifiOff } from 'atolla_app/src/ui/animations/LogoWifiOff';
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

describe('LogoWifiOff', () => {
	valdiIt('renders default accessibility label', async (driver) => {
		const viewModel = {};
		const component = driver.renderComponent(LogoWifiOff, viewModel, undefined);
		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const root = views.find((view) => view.getAttribute('accessibilityLabel') === 'logo-wifi-off');

		expect(root).toBeTruthy();
	});

	valdiIt('renders the provided accessibility label', async (driver) => {
		const viewModel = { accessibilityId: 'connectivity-fab-wifi-off' };
		const component = driver.renderComponent(LogoWifiOff, viewModel, undefined);
		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const root = views.find(
			(view) => view.getAttribute('accessibilityLabel') === 'connectivity-fab-wifi-off',
		);

		expect(root).toBeTruthy();
	});

	valdiIt('advances once without looping', async (driver) => {
		const viewModel = {};
		const component = driver.renderComponent(LogoWifiOff, viewModel, undefined);
		const animation = findAnimation(component);

		expect(animation.getAttribute('advanceRate')).toBe(1);
		expect(animation.getAttribute('loop')).toBe(false);
	});
});
