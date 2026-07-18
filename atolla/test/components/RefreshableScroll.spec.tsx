import 'jasmine/src/jasmine';
import { RefreshableScroll } from 'atolla/src/ui/components/RefreshableScroll';
import { componentGetElements } from 'foundation/test/util/componentGetElements';
import { elementTypeFind } from 'foundation/test/util/elementTypeFind';
import type { IRenderedElement } from 'valdi_core/src/IRenderedElement';
import { IRenderedElementViewClass } from 'valdi_test/test/IRenderedElementViewClass';
import { valdiIt } from 'valdi_test/test/JSXTestUtils';
import { scrollEndEvent, scrollEvent, styleAttribute } from '../util/testEvents';

function scrollOf(
	component: Parameters<typeof componentGetElements>[0],
): IRenderedElement | undefined {
	return elementTypeFind(componentGetElements(component), IRenderedElementViewClass.ScrollView)[0];
}

function overlayOpacityOf(component: Parameters<typeof componentGetElements>[0]): unknown {
	const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
	const overlay = views.find(
		(view) => view.getAttribute('accessibilityLabel') === 'refreshable-scroll-refresh',
	);
	// the pull fade is applied imperatively (getAttribute); the resting/refreshing value is styled
	return overlay?.getAttribute('opacity') ?? styleAttribute(overlay, 'opacity');
}

describe('RefreshableScroll', () => {
	valdiIt('fires onRefresh after overscrolling past the threshold and settling', async (driver) => {
		let refreshed = 0;
		const viewModel = {
			isRefreshing: false,
			onRefresh: () => {
				refreshed += 1;
			},
		};
		const component = driver.renderComponent(RefreshableScroll, viewModel, undefined);
		const scroll = scrollOf(component);

		scroll?.getAttribute('onScroll')?.(scrollEvent({ y: -120 }));
		scroll?.getAttribute('onScrollEnd')?.(scrollEndEvent());

		expect(refreshed).toBe(1);
	});

	valdiIt('lights the spinner overlay as soon as a refresh is triggered', async (driver) => {
		// onRefresh never flips isRefreshing (mirrors an instant/cached refresh); the overlay must
		// still show immediately rather than waiting on a state round-trip that would coalesce away
		const viewModel = { isRefreshing: false, onRefresh: () => {} };
		const component = driver.renderComponent(RefreshableScroll, viewModel, undefined);
		const scroll = scrollOf(component);

		scroll?.getAttribute('onScroll')?.(scrollEvent({ y: -120 }));
		scroll?.getAttribute('onScrollEnd')?.(scrollEndEvent());

		expect(overlayOpacityOf(component)).toBe(1);
	});

	valdiIt('does not fire onRefresh for a pull short of the threshold', async (driver) => {
		let refreshed = 0;
		const viewModel = {
			isRefreshing: false,
			onRefresh: () => {
				refreshed += 1;
			},
		};
		const component = driver.renderComponent(RefreshableScroll, viewModel, undefined);
		const scroll = scrollOf(component);

		scroll?.getAttribute('onScroll')?.(scrollEvent({ y: -20 }));
		scroll?.getAttribute('onScrollEnd')?.(scrollEndEvent());

		expect(refreshed).toBe(0);
	});

	valdiIt('does not fire onRefresh while already refreshing', async (driver) => {
		let refreshed = 0;
		const viewModel = {
			isRefreshing: true,
			onRefresh: () => {
				refreshed += 1;
			},
		};
		const component = driver.renderComponent(RefreshableScroll, viewModel, undefined);
		const scroll = scrollOf(component);

		scroll?.getAttribute('onScroll')?.(scrollEvent({ y: -120 }));
		scroll?.getAttribute('onScrollEnd')?.(scrollEndEvent());

		expect(refreshed).toBe(0);
	});

	valdiIt('forwards the scroll offset to onScroll', async (driver) => {
		const offsets: Array<number> = [];
		const viewModel = {
			isRefreshing: false,
			onRefresh: () => {},
			onScroll: (y: number) => offsets.push(y),
		};
		const component = driver.renderComponent(RefreshableScroll, viewModel, undefined);

		scrollOf(component)?.getAttribute('onScroll')?.(scrollEvent({ y: 42 }));

		expect(offsets).toContain(42);
	});

	valdiIt('fades the spinner overlay in as the pull grows', async (driver) => {
		const viewModel = { isRefreshing: false, onRefresh: () => {} };
		const component = driver.renderComponent(RefreshableScroll, viewModel, undefined);
		const scroll = scrollOf(component);

		expect(overlayOpacityOf(component)).toBe(0);

		// a partial pull fades the overlay partway in
		scroll?.getAttribute('onScroll')?.(scrollEvent({ y: -17.5 }));
		expect(overlayOpacityOf(component)).toBeCloseTo(0.5, 1);

		// crossing the threshold takes it to full opacity
		scroll?.getAttribute('onScroll')?.(scrollEvent({ y: -40 }));
		expect(overlayOpacityOf(component)).toBe(1);
	});

	valdiIt('shows the spinner overlay lit while refreshing', async (driver) => {
		const viewModel = { isRefreshing: true, onRefresh: () => {} };
		const component = driver.renderComponent(RefreshableScroll, viewModel, undefined);

		expect(overlayOpacityOf(component)).toBe(1);
	});
});
