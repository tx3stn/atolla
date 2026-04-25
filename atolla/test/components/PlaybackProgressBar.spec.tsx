// @ts-nocheck
import 'jasmine/src/jasmine';
import { PlaybackProgressBar } from 'atolla/src/ui/components/PlaybackProgressBar';
import { componentGetElements } from 'foundation/test/util/componentGetElements';
import { elementTypeFind } from 'foundation/test/util/elementTypeFind';
import { IRenderedElementViewClass } from 'valdi_test/test/IRenderedElementViewClass';
import { createComponent, valdiIt } from 'valdi_test/test/JSXTestUtils';

describe('PlaybackProgressBar', () => {
	valdiIt('renders track and fill colors from view model', () => {
		const instrumented = createComponent(PlaybackProgressBar, {
			accentColor: '#ff2255',
			progressRatio: 0.4,
			trackColor: 'rgba(255,34,85,0.2)',
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

	valdiIt('clamps progress ratio into 0 to 1 bounds', () => {
		const instrumented = createComponent(PlaybackProgressBar, {
			accentColor: '#33ffaa',
			progressRatio: 2.4,
			trackColor: 'rgba(51,255,170,0.2)',
		});
		const component = instrumented.getComponent();

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const fill = views.find(
			(view) => view.getAttribute('accessibilityLabel') === 'playback-progress-fill',
		);

		expect(fill?.getAttribute('style').attributes.width).toBe('100%');
	});

	valdiIt('calls onProgressTap when tapped', () => {
		let tapCount = 0;
		const instrumented = createComponent(PlaybackProgressBar, {
			accentColor: '#33ffaa',
			onProgressTap: () => {
				tapCount += 1;
			},
			progressRatio: 0.5,
			trackColor: 'rgba(51,255,170,0.2)',
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
