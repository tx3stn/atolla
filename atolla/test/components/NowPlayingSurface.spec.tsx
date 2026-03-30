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

function createNowPlayingComponent(trackOverrides = {}, albumOverride = album) {
	const mergedTrack = {
		...track,
		...trackOverrides,
	};

	return createComponent(NowPlayingSurface, {
		album: albumOverride,
		artistLogoUrl: null,
		collapseSignal: 0,
		isPlaying: true,
		onDismiss: () => {},
		onNext: () => {},
		onPlayPause: () => {},
		onPrevious: () => {},
		progressSeconds: 90,
		track: mergedTrack,
		trackIndex: 0,
		tracks: [mergedTrack],
	});
}

function getLabelValues(component): Array<string> {
	const labels = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.Label);
	return labels.map((label) => label.getAttribute('value'));
}

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
			trackIndex: 0,
			tracks: [track],
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
		const instrumented = createNowPlayingComponent();
		const component = instrumented.getComponent();

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const compactBar = views.find((view) => view.getAttribute('id') === 'now-playing-surface-bar');
		const overlay = views.find((view) => view.getAttribute('id') === 'now-playing-surface-overlay');

		expect(overlay?.getAttribute('top')).not.toBe(0);
		compactBar?.getAttribute('onTap')?.();
		expect(overlay?.getAttribute('top')).toBe(0);
	});

	valdiIt('shows add-to-queue toast when context menu action is tapped', () => {
		let addToQueueCalls = 0;
		const playbackStore = {
			addToQueue: () => {
				addToQueueCalls += 1;
			},
		};
		const transport = {
			getArtistLogoUrl: () => Promise.resolve(null),
		};

		const instrumented = createComponent(NowPlayingSurface, {
			album,
			artistLogoUrl: null,
			collapseSignal: 0,
			isPlaying: true,
			onDismiss: () => {},
			onNext: () => {},
			onPlayPause: () => {},
			onPrevious: () => {},
			playbackStore,
			progressSeconds: 90,
			track,
			trackIndex: 0,
			tracks: [track],
			transport,
		});
		const component = instrumented.getComponent();

		component.setState({ contextMenuTrack: track });

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const addToQueueAction = views.find(
			(view) => view.getAttribute('accessibilityLabel') === 'track-context-add-to-queue',
		);
		addToQueueAction?.getAttribute('onTap')?.();

		const labels = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.Label,
		);
		const values = labels.map((label) => label.getAttribute('value'));

		expect(addToQueueCalls).toBe(1);
		expect(values).toContain('added to queue');
	});

	valdiIt('handles collapse signal update while expanded', () => {
		const instrumented = createNowPlayingComponent();
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
			trackIndex: 0,
			tracks: [track],
		});

		views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const overlay = views.find((view) => view.getAttribute('id') === 'now-playing-surface-overlay');
		expect(overlay).toBeDefined();
	});

	valdiIt('shows album line year from track productionYear when album is missing', () => {
		const instrumented = createNowPlayingComponent(
			{
				albumName: 'Playlist Album',
				productionYear: 2019,
			},
			null,
		);
		const component = instrumented.getComponent();

		const values = getLabelValues(component);

		expect(values).toContain('Playlist Album (2019)');
	});

	valdiIt('derives album line year from track releaseDate when productionYear is missing', () => {
		const instrumented = createNowPlayingComponent(
			{
				albumName: 'Release Date Album',
				releaseDate: '2004-06-01T00:00:00.0000000Z',
			},
			null,
		);
		const component = instrumented.getComponent();

		const values = getLabelValues(component);

		expect(values).toContain('Release Date Album (2004)');
	});

	valdiIt('shows album name without year when playlist track has no valid date metadata', () => {
		const instrumented = createNowPlayingComponent(
			{
				albumName: 'Untimed Album',
				releaseDate: 'na',
			},
			null,
		);
		const component = instrumented.getComponent();

		const values = getLabelValues(component);

		expect(values).toContain('Untimed Album');
		expect(values).not.toContain('Untimed Album (na)');
	});
});
