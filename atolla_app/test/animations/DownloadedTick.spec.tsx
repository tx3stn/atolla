import 'jasmine/src/jasmine';
import { DownloadedTick } from 'atolla_app/src/ui/animations/DownloadedTick';
import { componentGetElements } from 'foundation/test/util/componentGetElements';
import { elementTypeFind } from 'foundation/test/util/elementTypeFind';
import { IRenderedElementViewClass } from 'valdi_test/test/IRenderedElementViewClass';
import { valdiIt } from 'valdi_test/test/JSXTestUtils';

const duration = 0.72;

function findAnimation(component: Parameters<typeof componentGetElements>[0]) {
	const animations = elementTypeFind(
		componentGetElements(component),
		IRenderedElementViewClass.AnimatedImage,
	);
	expect(animations.length).toBe(1);
	return animations[0];
}

describe('DownloadedTick', () => {
	valdiIt('renders default accessibility label', async (driver) => {
		const viewModel = { onComplete: () => {} };
		const component = driver.renderComponent(DownloadedTick, viewModel, undefined);
		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const root = views.find(
			(view) => view.getAttribute('accessibilityLabel') === 'downloaded-tick',
		);

		expect(root).toBeTruthy();
	});

	valdiIt('renders the provided accessibility label', async (driver) => {
		const viewModel = {
			accessibilityId: 'detail-header-downloaded-tick',
			onComplete: () => {},
		};
		const component = driver.renderComponent(DownloadedTick, viewModel, undefined);
		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const root = views.find(
			(view) => view.getAttribute('accessibilityLabel') === 'detail-header-downloaded-tick',
		);

		expect(root).toBeTruthy();
	});

	valdiIt('advances once without looping', async (driver) => {
		const viewModel = { onComplete: () => {} };
		const component = driver.renderComponent(DownloadedTick, viewModel, undefined);
		const animation = findAnimation(component);

		expect(animation.getAttribute('advanceRate')).toBe(1);
		expect(animation.getAttribute('loop')).toBe(false);
	});

	valdiIt('completes when the animation reaches the end', async (driver) => {
		let completions = 0;
		const viewModel = {
			onComplete: () => {
				completions += 1;
			},
		};
		const component = driver.renderComponent(DownloadedTick, viewModel, undefined);

		findAnimation(component).getAttribute('onProgress')?.({ duration, time: duration });

		expect(completions).toBe(1);
	});

	valdiIt('does not complete part way through the animation', async (driver) => {
		let completions = 0;
		const viewModel = {
			onComplete: () => {
				completions += 1;
			},
		};
		const component = driver.renderComponent(DownloadedTick, viewModel, undefined);

		findAnimation(component).getAttribute('onProgress')?.({ duration, time: 0.4 });

		expect(completions).toBe(0);
	});

	valdiIt('completes once when the end is reported repeatedly', async (driver) => {
		let completions = 0;
		const viewModel = {
			onComplete: () => {
				completions += 1;
			},
		};
		const component = driver.renderComponent(DownloadedTick, viewModel, undefined);
		const animation = findAnimation(component);

		animation.getAttribute('onProgress')?.({ duration, time: duration });
		animation.getAttribute('onProgress')?.({ duration, time: duration });

		expect(completions).toBe(1);
	});

	valdiIt('ignores progress reported before the duration is known', async (driver) => {
		let completions = 0;
		const viewModel = {
			onComplete: () => {
				completions += 1;
			},
		};
		const component = driver.renderComponent(DownloadedTick, viewModel, undefined);

		findAnimation(component).getAttribute('onProgress')?.({ duration: 0, time: 0 });

		expect(completions).toBe(0);
	});
});
