import 'jasmine/src/jasmine';
import { ProgressBarPlain } from 'atolla/src/ui/components/ProgressBarPlain';
import { componentGetElements } from 'foundation/test/util/componentGetElements';
import { elementTypeFind } from 'foundation/test/util/elementTypeFind';
import { IRenderedElementViewClass } from 'valdi_test/test/IRenderedElementViewClass';
import { createComponent, valdiIt } from 'valdi_test/test/JSXTestUtils';

function mockStore(progressSeconds: number) {
	return {
		progressSeconds,
		subscribe: () => () => {},
	};
}

describe('ProgressBarPlain', () => {
	valdiIt('renders track and fill colors from view model', async () => {
		const instrumented = createComponent(ProgressBarPlain, {
			accentColor: '#ff2255',
			playbackStore: mockStore(40),
			trackColor: 'rgba(255,34,85,0.2)',
			trackDuration: 100,
		});
		const component = instrumented.getComponent();

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const root = views.find(
			(view) => view.getAttribute('accessibilityLabel') === 'playback-progress-bar',
		);
		const track = views.find(
			(view) => view.getAttribute('accessibilityLabel') === 'playback-progress-track',
		);
		const fill = views.find(
			(view) => view.getAttribute('accessibilityLabel') === 'playback-progress-fill',
		);
		const playhead = views.find(
			(view) => view.getAttribute('accessibilityLabel') === 'playback-progress-playhead',
		);

		expect(root?.getAttribute('style').attributes.width).toBe('100%');
		expect(track).toBeDefined();
		expect(fill?.getAttribute('style').attributes.backgroundColor).toBe('#ff2255');
		expect(fill?.getAttribute('style').attributes.width).toBe('40%');
		expect(playhead).toBeDefined();
	});

	valdiIt('clamps progress ratio into 0 to 1 bounds', async () => {
		const instrumented = createComponent(ProgressBarPlain, {
			accentColor: '#33ffaa',
			playbackStore: mockStore(240),
			trackColor: 'rgba(51,255,170,0.2)',
			trackDuration: 100,
		});
		const component = instrumented.getComponent();

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const fill = views.find(
			(view) => view.getAttribute('accessibilityLabel') === 'playback-progress-fill',
		);

		expect(fill?.getAttribute('style').attributes.width).toBe('100%');
	});

	valdiIt('calls onProgressTap when tapped', async () => {
		let tapCount = 0;
		const instrumented = createComponent(ProgressBarPlain, {
			accentColor: '#33ffaa',
			onProgressTap: () => {
				tapCount += 1;
			},
			playbackStore: mockStore(50),
			trackColor: 'rgba(51,255,170,0.2)',
			trackDuration: 100,
		});
		const component = instrumented.getComponent();

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const track = views.find(
			(view) => view.getAttribute('accessibilityLabel') === 'playback-progress-track',
		);
		track?.getAttribute('onTap')?.();

		expect(tapCount).toBe(1);
	});
});
