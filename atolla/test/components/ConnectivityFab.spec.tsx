import 'jasmine/src/jasmine';
import { ConnectionModes } from 'atolla/src/models/App';
import { ConnectivityFab } from 'atolla/src/ui/components/ConnectivityFab';
import { componentGetElements } from 'foundation/test/util/componentGetElements';
import { elementTypeFind } from 'foundation/test/util/elementTypeFind';
import { IRenderedElementViewClass } from 'valdi_test/test/IRenderedElementViewClass';
import { valdiIt } from 'valdi_test/test/JSXTestUtils';
import { touchEvent } from '../util/testEvents';

function makeViewModel(animationsEnabled: boolean) {
	return {
		animationsEnabled,
		connectionMode: ConnectionModes.offline,
		onRequestModeChange: () => Promise.resolve(true),
	};
}

function tapFab(component: Parameters<typeof componentGetElements>[0]): void {
	const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
	views
		.find((view) => view.getAttribute('accessibilityLabel') === 'connectivity-fab')
		?.getAttribute('onTap')?.(touchEvent);
}

function animationCount(component: Parameters<typeof componentGetElements>[0]): number {
	return elementTypeFind(componentGetElements(component), IRenderedElementViewClass.AnimatedImage)
		.length;
}

describe('ConnectivityFab', () => {
	valdiIt('plays the wifi animation when switching online', async (driver) => {
		const component = driver.renderComponent(ConnectivityFab, makeViewModel(true), undefined);

		expect(animationCount(component)).toBe(0);

		tapFab(component);

		expect(animationCount(component)).toBe(1);
	});

	valdiIt('shows the static logo when animations are disabled', async (driver) => {
		const component = driver.renderComponent(ConnectivityFab, makeViewModel(false), undefined);

		tapFab(component);

		expect(animationCount(component)).toBe(0);
		expect(
			elementTypeFind(componentGetElements(component), IRenderedElementViewClass.Image).length,
		).toBe(1);
	});
});
