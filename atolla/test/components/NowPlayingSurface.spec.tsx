// @ts-nocheck
import 'jasmine/src/jasmine';
import { NowPlayingSurface } from 'atolla/src/ui/components/NowPlayingSurface';
import { componentGetElements } from 'foundation/test/util/componentGetElements';
import { elementTypeFind } from 'foundation/test/util/elementTypeFind';
import { IRenderedElementViewClass } from 'valdi_test/test/IRenderedElementViewClass';
import { createComponent, valdiIt } from 'valdi_test/test/JSXTestUtils';

const album = {
	artistId: 'artist-1',
	artistName: 'The Artist',
	id: 'album-1',
	imageUrl: 'https://example.com/art.jpg',
	name: 'The Album',
	releaseDate: '2024-01-01',
};

const track = {
	artistName: 'The Artist',
	duration: 240,
	id: 'track-1',
	name: 'The Track',
};

describe('NowPlayingSurface', () => {
	valdiIt('renders compact now-playing content by default', () => {
		const instrumented = createComponent(NowPlayingSurface, {
			album,
			artistLogoUrl: null,
			collapseSignal: 0,
			isPlaying: true,
			onDismiss: () => {},
			onNext: () => {},
			onPlayPause: () => {},
			onPrevious: () => {},
			progressSeconds: 90,
			track,
		});
		const component = instrumented.getComponent();

		const labels = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.Label,
		);
		const values = labels.map((label) => label.getAttribute('value'));

		expect(values).toContain('The Track');
		expect(values).toContain('The Artist');
		expect(values).toContain('1:30 / 4:00');
	});

	valdiIt('shows expanded now-playing view when compact bar is tapped', () => {
		const instrumented = createComponent(NowPlayingSurface, {
			album,
			artistLogoUrl: null,
			collapseSignal: 0,
			isPlaying: true,
			onDismiss: () => {},
			onNext: () => {},
			onPlayPause: () => {},
			onPrevious: () => {},
			progressSeconds: 90,
			track,
		});
		const component = instrumented.getComponent();

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const compactBar = views.find((view) => view.getAttribute('id') === 'now-playing-surface-bar');
		const overlay = views.find((view) => view.getAttribute('id') === 'now-playing-surface-overlay');

		expect(overlay?.getAttribute('top')).not.toBe(0);
		compactBar?.getAttribute('onTap')?.();
		expect(overlay?.getAttribute('top')).toBe(0);
	});

	valdiIt('handles collapse signal update while expanded', () => {
		const instrumented = createComponent(NowPlayingSurface, {
			album,
			artistLogoUrl: null,
			collapseSignal: 0,
			isPlaying: true,
			onDismiss: () => {},
			onNext: () => {},
			onPlayPause: () => {},
			onPrevious: () => {},
			progressSeconds: 90,
			track,
		});
		const component = instrumented.getComponent();

		let views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const compactBar = views.find((view) => view.getAttribute('id') === 'now-playing-surface-bar');

		compactBar?.getAttribute('onTap')?.();
		instrumented.setViewModel({
			album,
			artistLogoUrl: null,
			collapseSignal: 1,
			isPlaying: true,
			onDismiss: () => {},
			onNext: () => {},
			onPlayPause: () => {},
			onPrevious: () => {},
			progressSeconds: 90,
			track,
		});

		views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const overlay = views.find((view) => view.getAttribute('id') === 'now-playing-surface-overlay');
		expect(overlay).toBeDefined();
	});
});
