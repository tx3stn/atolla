// @ts-nocheck
import 'jasmine/src/jasmine';
import { NowPlayingBar } from 'atolla/src/ui/components/NowPlayingBar';
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
};

const track = {
	artistName: 'The Artist',
	duration: 240,
	id: 'track-1',
	name: 'The Track',
};

describe('NowPlayingBar', () => {
	valdiIt('renders track name and artist name', () => {
		const instrumented = createComponent(NowPlayingBar, {
			album,
			isPlaying: true,
			onDismiss: () => {},
			onTap: () => {},
			progressSeconds: 0,
			track,
		});
		const component = instrumented.getComponent();

		const labels = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.Label,
		);
		const values = labels.map((l) => l.getAttribute('value'));
		expect(values).toContain('The Track');
		expect(values).toContain('The Artist');
	});

	valdiIt('renders formatted elapsed and total time', () => {
		const instrumented = createComponent(NowPlayingBar, {
			album,
			isPlaying: true,
			onDismiss: () => {},
			onTap: () => {},
			progressSeconds: 90,
			track,
		});
		const component = instrumented.getComponent();

		const labels = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.Label,
		);
		const values = labels.map((l) => l.getAttribute('value'));
		expect(values).toContain('1:30 / 4:00');
	});

	valdiIt('renders album artwork image', () => {
		const instrumented = createComponent(NowPlayingBar, {
			album,
			isPlaying: false,
			onDismiss: () => {},
			onTap: () => {},
			progressSeconds: 0,
			track,
		});
		const component = instrumented.getComponent();

		const images = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.Image,
		);
		const sources = images.map((i) => i.getAttribute('src'));
		expect(sources).toContain('https://example.com/art.jpg');
	});

	valdiIt('uses album artist name when track has no artistName', () => {
		const trackNoArtist = { duration: 180, id: 'track-2', name: 'Unnamed Track' };
		const instrumented = createComponent(NowPlayingBar, {
			album,
			isPlaying: false,
			onDismiss: () => {},
			onTap: () => {},
			progressSeconds: 0,
			track: trackNoArtist,
		});
		const component = instrumented.getComponent();

		const labels = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.Label,
		);
		const values = labels.map((l) => l.getAttribute('value'));
		expect(values).toContain('The Artist');
	});

	valdiIt('calls onTap when bar is tapped', () => {
		let tapped = false;
		const instrumented = createComponent(NowPlayingBar, {
			album,
			isPlaying: true,
			onDismiss: () => {},
			onTap: () => {
				tapped = true;
			},
			progressSeconds: 0,
			track,
		});
		const component = instrumented.getComponent();

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const bar = views.find((v) => v.getAttribute('onTap') != null);
		bar?.getAttribute('onTap')?.();

		expect(tapped).toBe(true);
	});

	valdiIt('updates time label when progressSeconds changes', () => {
		const instrumented = createComponent(NowPlayingBar, {
			album,
			isPlaying: true,
			onDismiss: () => {},
			onTap: () => {},
			progressSeconds: 0,
			track,
		});
		const component = instrumented.getComponent();

		instrumented.setViewModel({
			album,
			isPlaying: true,
			onDismiss: () => {},
			onTap: () => {},
			progressSeconds: 120,
			track,
		});

		const labels = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.Label,
		);
		const values = labels.map((l) => l.getAttribute('value'));
		expect(values).toContain('2:00 / 4:00');
	});
});
