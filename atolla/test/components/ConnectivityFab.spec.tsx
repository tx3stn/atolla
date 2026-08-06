import 'jasmine/src/jasmine';
import res from 'atolla/res';
import { type ConnectionMode, ConnectionModes } from 'atolla/src/models/App';
import { ConnectivityFab } from 'atolla/src/ui/components/ConnectivityFab';
import { componentGetElements } from 'foundation/test/util/componentGetElements';
import { elementTypeFind } from 'foundation/test/util/elementTypeFind';
import { IRenderedElementViewClass } from 'valdi_test/test/IRenderedElementViewClass';
import { valdiIt } from 'valdi_test/test/JSXTestUtils';
import type { Asset } from 'valdi_tsx/src/Asset';
import { touchEvent } from '../util/testEvents';

function makeViewModel(animationsEnabled: boolean, connectionMode: ConnectionMode) {
	return {
		animationsEnabled,
		connectionMode,
		onRequestModeChange: () => Promise.resolve(true),
	};
}

function tapFab(component: Parameters<typeof componentGetElements>[0]): void {
	const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
	views
		.find((view) => view.getAttribute('accessibilityLabel') === 'connectivity-fab')
		?.getAttribute('onTap')?.(touchEvent);
}

function hasLabel(component: Parameters<typeof componentGetElements>[0], label: string): boolean {
	return elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View).some(
		(view) => view.getAttribute('accessibilityLabel') === label,
	);
}

function animationCount(component: Parameters<typeof componentGetElements>[0]): number {
	return elementTypeFind(componentGetElements(component), IRenderedElementViewClass.AnimatedImage)
		.length;
}

function rendersIcon(component: Parameters<typeof componentGetElements>[0], icon: Asset): boolean {
	const images = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.Image);
	return images.some((image) => image.getAttribute('src') === icon);
}

describe('ConnectivityFab', () => {
	valdiIt('plays the wifi animation when switching online', async (driver) => {
		const component = driver.renderComponent(
			ConnectivityFab,
			makeViewModel(true, ConnectionModes.offline),
			undefined,
		);

		expect(animationCount(component)).toBe(0);

		tapFab(component);

		expect(animationCount(component)).toBe(1);
		expect(hasLabel(component, 'logo-wifi-on')).toBe(true);
	});

	valdiIt('plays the wifi off animation when switching offline', async (driver) => {
		const component = driver.renderComponent(
			ConnectivityFab,
			makeViewModel(true, ConnectionModes.online),
			undefined,
		);

		expect(animationCount(component)).toBe(0);

		tapFab(component);

		expect(animationCount(component)).toBe(1);
		expect(hasLabel(component, 'logo-wifi-off')).toBe(true);
	});

	// the static logo stays mounted underneath the animation so it is already painted when the
	// animation unmounts; swapping a fresh image in at that moment flickers
	valdiIt('keeps the static logo mounted while the wifi animation plays', async (driver) => {
		const component = driver.renderComponent(
			ConnectivityFab,
			makeViewModel(true, ConnectionModes.offline),
			undefined,
		);

		tapFab(component);

		expect(animationCount(component)).toBe(1);
		expect(rendersIcon(component, res.logowifion)).toBe(true);
	});

	valdiIt('shows the static logo when animations are disabled', async (driver) => {
		const component = driver.renderComponent(
			ConnectivityFab,
			makeViewModel(false, ConnectionModes.offline),
			undefined,
		);

		tapFab(component);

		expect(animationCount(component)).toBe(0);
		expect(
			elementTypeFind(componentGetElements(component), IRenderedElementViewClass.Image).length,
		).toBe(1);
	});
});
