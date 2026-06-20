import 'jasmine/src/jasmine';
import { ProgressBarWaveform } from 'atolla/src/ui/components/ProgressBarWaveform';
import { componentGetElements } from 'foundation/test/util/componentGetElements';
import { elementTypeFind } from 'foundation/test/util/elementTypeFind';
import { IRenderedElementViewClass } from 'valdi_test/test/IRenderedElementViewClass';
import { valdiIt } from 'valdi_test/test/JSXTestUtils';
import { touchEvent } from '../util/testEvents';

function mockStore(progressSeconds: number) {
	return {
		progressSeconds,
		subscribe: () => () => {},
	};
}

describe('ProgressBarWaveform', () => {
	valdiIt('renders ProgressBarPlain fallback when maskImageUrl is null', async (driver) => {
		const viewModel = {
			accentColor: '#ff2255',
			maskImageUrl: null,
			mutedColor: 'rgba(255,34,85,0.3)',
			playbackStore: mockStore(40),
			trackColor: 'rgba(255,34,85,0.2)',
			trackDuration: 100,
		};
		const component = driver.renderComponent(ProgressBarWaveform, viewModel, undefined);

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const waveformBar = views.find(
			(v) => v.getAttribute('accessibilityLabel') === 'waveform-progress-bar',
		);

		expect(waveformBar).toBeUndefined();
	});

	valdiIt('renders ProgressBarPlain fallback when maskImageUrl is undefined', async (driver) => {
		const viewModel = {
			accentColor: '#ff2255',
			maskImageUrl: undefined,
			mutedColor: 'rgba(255,34,85,0.3)',
			playbackStore: mockStore(40),
			trackColor: 'rgba(255,34,85,0.2)',
			trackDuration: 100,
		};
		const component = driver.renderComponent(ProgressBarWaveform, viewModel, undefined);

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const waveformBar = views.find(
			(v) => v.getAttribute('accessibilityLabel') === 'waveform-progress-bar',
		);

		expect(waveformBar).toBeUndefined();
	});

	valdiIt('renders waveform bar when maskImageUrl is provided', async (driver) => {
		const viewModel = {
			accentColor: '#ff2255',
			maskImageUrl: 'mask://track-1.png',
			mutedColor: 'rgba(255,34,85,0.3)',
			playbackStore: mockStore(50),
			trackColor: 'rgba(255,34,85,0.2)',
			trackDuration: 100,
		};
		const component = driver.renderComponent(ProgressBarWaveform, viewModel, undefined);

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const waveformBar = views.find(
			(v) => v.getAttribute('accessibilityLabel') === 'waveform-progress-bar',
		);

		expect(waveformBar).toBeDefined();
	});

	valdiIt('uses the provided accessibilityLabel on the waveform bar', async (driver) => {
		const viewModel = {
			accentColor: '#ff2255',
			accessibilityId: 'now-playing-progress',
			maskImageUrl: 'mask://track-1.png',
			mutedColor: 'rgba(255,34,85,0.3)',
			playbackStore: mockStore(50),
			trackColor: 'rgba(255,34,85,0.2)',
			trackDuration: 100,
		};
		const component = driver.renderComponent(ProgressBarWaveform, viewModel, undefined);

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const waveformBar = views.find(
			(v) => v.getAttribute('accessibilityLabel') === 'now-playing-progress',
		);

		expect(waveformBar).toBeDefined();
	});

	valdiIt('renders unplayed and played image layers when progress > 0', async (driver) => {
		const viewModel = {
			accentColor: '#ff2255',
			maskImageUrl: 'mask://track-1.png',
			mutedColor: 'rgba(255,34,85,0.3)',
			playbackStore: mockStore(50),
			trackColor: 'rgba(255,34,85,0.2)',
			trackDuration: 100,
		};
		const component = driver.renderComponent(ProgressBarWaveform, viewModel, undefined);

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const images = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.Image,
		);

		const unplayed = images.find(
			(img) => img.getAttribute('accessibilityLabel') === 'waveform-progress-unplayed',
		);
		const clipContainer = views.find(
			(v) => v.getAttribute('accessibilityLabel') === 'waveform-progress-clip',
		);

		expect(unplayed).toBeDefined();
		expect(clipContainer).toBeDefined();
	});

	valdiIt('renders clip container with zero width when progress is 0', async (driver) => {
		const viewModel = {
			accentColor: '#ff2255',
			maskImageUrl: 'mask://track-1.png',
			mutedColor: 'rgba(255,34,85,0.3)',
			playbackStore: mockStore(0),
			trackColor: 'rgba(255,34,85,0.2)',
			trackDuration: 100,
		};
		const component = driver.renderComponent(ProgressBarWaveform, viewModel, undefined);

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const clipContainer = views.find(
			(v) => v.getAttribute('accessibilityLabel') === 'waveform-progress-clip',
		);

		expect(clipContainer).toBeDefined();
		expect(clipContainer?.getAttribute('width')).toBe('0%');
	});

	valdiIt('calls onProgressTap when the waveform bar is tapped', async (driver) => {
		let tapCount = 0;
		const viewModel = {
			accentColor: '#ff2255',
			maskImageUrl: 'mask://track-1.png',
			mutedColor: 'rgba(255,34,85,0.3)',
			onProgressTap: () => {
				tapCount += 1;
			},
			playbackStore: mockStore(50),
			trackColor: 'rgba(255,34,85,0.2)',
			trackDuration: 100,
		};
		const component = driver.renderComponent(ProgressBarWaveform, viewModel, undefined);

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const waveformBar = views.find(
			(v) => v.getAttribute('accessibilityLabel') === 'waveform-progress-bar',
		);
		waveformBar?.getAttribute('onTap')?.(touchEvent);

		expect(tapCount).toBe(1);
	});
});
