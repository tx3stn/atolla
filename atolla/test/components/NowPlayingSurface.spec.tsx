import 'jasmine/src/jasmine';
import { BarColorStore, defaultFooterColors } from 'atolla/src/stores/BarColor';
import type { PlaybackStore } from 'atolla/src/stores/Playback';
import { paletteDefaults, theme, withAlpha } from 'atolla/src/theme';
import { NowPlayingSurface } from 'atolla/src/ui/components/NowPlayingSurface';
import { ToastService } from 'atolla/src/ui/components/ToastService';
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

function mockPlaybackStore(overrides: Record<string, unknown> = {}): PlaybackStore {
	return {
		progressSeconds: 90,
		subscribe: () => () => {},
		...overrides,
	} as unknown as PlaybackStore;
}

function createNowPlayingComponent(
	trackOverrides = {},
	albumOverride: typeof album | null = album,
) {
	const mergedTrack = {
		...track,
		...trackOverrides,
	};

	return createComponent(NowPlayingSurface, {
		album: albumOverride,
		artistLogoUrl: null,
		barColors: new BarColorStore(),
		collapseSignal: 0,
		isPlaying: true,
		loopMode: 'none',
		onDismiss: () => {},
		onLoopModeToggle: () => {},
		onNext: () => {},
		onPlayPause: () => {},
		onPrevious: () => {},
		playbackStore: mockPlaybackStore(),
		track: mergedTrack,
		trackIndex: 0,
		tracks: [mergedTrack],
	});
}

function getLabelValues(component: Parameters<typeof componentGetElements>[0]): Array<string> {
	const labels = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.Label);
	return labels.map((label) => label.getAttribute('value'));
}

function createQueueTracks(count: number) {
	return Array.from({ length: count }, (_, index) => ({
		...track,
		id: `track-${index + 1}`,
		name: `Track ${index + 1}`,
	}));
}

function getQueuePageRows(
	component: Parameters<typeof componentGetElements>[0],
	pageLabel: 'now-playing-queue-page-back-to' | 'now-playing-queue-page-up-next',
): Array<string> {
	const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
	const accessibilityLabels = views.map((v) => v.getAttribute('accessibilityLabel'));

	const pageStart = accessibilityLabels.indexOf(pageLabel);
	if (pageStart === -1) return [];

	const otherPageLabel =
		pageLabel === 'now-playing-queue-page-back-to'
			? 'now-playing-queue-page-up-next'
			: 'now-playing-queue-page-back-to';
	const nextPageStart = accessibilityLabels.indexOf(otherPageLabel, pageStart + 1);

	const pageViews =
		nextPageStart === -1 ? views.slice(pageStart + 1) : views.slice(pageStart + 1, nextPageStart);

	const rowPrefix =
		pageLabel === 'now-playing-queue-page-back-to'
			? 'track-row-back-to-track-'
			: 'track-row-up-next-track-';
	return pageViews
		.map((v) => v.getAttribute('accessibilityLabel'))
		.filter((label): label is string => typeof label === 'string' && label.startsWith(rowPrefix));
}

describe('NowPlayingSurface', () => {
	valdiIt('renders compact now-playing content by default', async () => {
		const instrumented = createComponent(NowPlayingSurface, {
			album,
			artistLogoUrl: null,
			barColors: new BarColorStore(),
			collapseSignal: 0,
			isPlaying: true,
			loopMode: 'none',
			onDismiss: () => {},
			onLoopModeToggle: () => {},
			onNext: () => {},
			onPlayPause: () => {},
			onPrevious: () => {},
			playbackStore: mockPlaybackStore(),
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

	valdiIt('shows expanded now-playing view when compact bar is tapped', async () => {
		const instrumented = createNowPlayingComponent();
		const component = instrumented.getComponent();

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const compactBar = views.find((view) => view.getAttribute('id') === 'now-playing-surface-bar');
		const overlay = views.find((view) => view.getAttribute('id') === 'now-playing-surface-overlay');

		expect(overlay?.getAttribute('top')).not.toBe(0);
		compactBar?.getAttribute('onTap')?.();
		expect(overlay?.getAttribute('top')).toBe(0);
	});

	valdiIt(
		'tints the footer and device nav bar when expanded and resets when torn down',
		async () => {
			const barColors = new BarColorStore();
			const navBarColors: Array<string> = [];
			barColors.setNavigationBarColor = (color: string) => {
				navBarColors.push(color);
			};
			const instrumented = createComponent(NowPlayingSurface, {
				album,
				artistLogoUrl: null,
				barColors,
				collapseSignal: 0,
				isPlaying: true,
				loopMode: 'none',
				onDismiss: () => {},
				onLoopModeToggle: () => {},
				onNext: () => {},
				onPlayPause: () => {},
				onPrevious: () => {},
				playbackStore: mockPlaybackStore(),
				track,
				trackIndex: 0,
				tracks: [track],
			});
			const component = instrumented.getComponent();

			const views = elementTypeFind(
				componentGetElements(component),
				IRenderedElementViewClass.View,
			);
			const compactBar = views.find(
				(view) => view.getAttribute('id') === 'now-playing-surface-bar',
			);

			expect(barColors.footer).toEqual(defaultFooterColors);

			compactBar?.getAttribute('onTap')?.();
			expect(barColors.footer).toEqual({
				activeIconColor: paletteDefaults.onSurface,
				background: withAlpha(paletteDefaults.surface, 0.8),
				inactiveIconColor: withAlpha(paletteDefaults.mutedOnSurface, 0.58),
			});
			expect(navBarColors).toContain(paletteDefaults.surface);

			instrumented.destroy();
			expect(barColors.footer).toEqual(defaultFooterColors);
			expect(navBarColors).toContain(theme.colors.bg);
		},
	);

	valdiIt('shows add-to-queue toast when context menu action is tapped', async () => {
		let addToQueueCalls = 0;
		const playbackStore = mockPlaybackStore({
			addToQueue: () => {
				addToQueueCalls += 1;
			},
		});
		const transport = {
			getArtistLogoUrl: () => Promise.resolve(null),
		};
		const toastService = new ToastService();

		const instrumented = createComponent(NowPlayingSurface, {
			album,
			artistLogoUrl: null,
			barColors: new BarColorStore(),
			collapseSignal: 0,
			isPlaying: true,
			loopMode: 'none',
			onDismiss: () => {},
			onLoopModeToggle: () => {},
			onNext: () => {},
			onPlayPause: () => {},
			onPrevious: () => {},
			playbackStore,
			toastService,
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

		expect(addToQueueCalls).toBe(1);
		expect(toastService.getMessage()).toBe('added to queue');
	});

	valdiIt('removes a queued track by swipe after entering queue edit mode', async () => {
		jasmine.clock().install();
		try {
			const playbackStore = mockPlaybackStore({
				removeFromQueueAt: jasmine.createSpy('removeFromQueueAt'),
			});
			const tracks = [
				{ ...track, id: 'track-1', name: 'Track One' },
				{ ...track, id: 'track-2', name: 'Track Two' },
				{ ...track, id: 'track-3', name: 'Track Three' },
			];

			const instrumented = createComponent(NowPlayingSurface, {
				album,
				artistLogoUrl: null,
				barColors: new BarColorStore(),
				collapseSignal: 0,
				isPlaying: true,
				loopMode: 'none',
				onDismiss: () => {},
				onLoopModeToggle: () => {},
				onNext: () => {},
				onPlayPause: () => {},
				onPrevious: () => {},
				playbackStore,
				track: tracks[1],
				trackIndex: 1,
				tracks,
			});
			const component = instrumented.getComponent();

			let views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
			const compactBar = views.find(
				(view) => view.getAttribute('id') === 'now-playing-surface-bar',
			);
			compactBar?.getAttribute('onTap')?.();

			views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
			const artworkTouch = views.find(
				(view) =>
					view.getAttribute('accessibilityLabel') === 'track-row-swipe-region-up-next-track-3-0',
			);
			artworkTouch?.getAttribute('onTouch')?.({ state: 0 });
			jasmine.clock().tick(500);

			views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
			const upNextRowSwipeRegion = views.find(
				(view) =>
					view.getAttribute('accessibilityLabel') === 'track-row-swipe-region-up-next-track-3-0',
			);
			upNextRowSwipeRegion?.getAttribute('onDrag')?.({
				deltaX: -72,
				deltaY: 0,
				state: 1,
				velocityX: -100,
			});
			upNextRowSwipeRegion?.getAttribute('onDrag')?.({
				deltaX: -72,
				deltaY: 0,
				state: 2,
				velocityX: -100,
			});

			expect(playbackStore.removeFromQueueAt).toHaveBeenCalledWith(2);
		} finally {
			jasmine.clock().uninstall();
		}
	});

	valdiIt('reorders up-next tracks when a queue row is dragged vertically', async () => {
		const playbackStore = mockPlaybackStore({
			moveQueueTrack: jasmine.createSpy('moveQueueTrack'),
			removeFromQueueAt: jasmine.createSpy('removeFromQueueAt'),
		});
		const tracks = [
			{ ...track, id: 'track-1', name: 'Track One' },
			{ ...track, id: 'track-2', name: 'Track Two' },
			{ ...track, id: 'track-3', name: 'Track Three' },
			{ ...track, id: 'track-4', name: 'Track Four' },
		];

		const instrumented = createComponent(NowPlayingSurface, {
			album,
			artistLogoUrl: null,
			barColors: new BarColorStore(),
			collapseSignal: 0,
			isPlaying: true,
			loopMode: 'none',
			onDismiss: () => {},
			onLoopModeToggle: () => {},
			onNext: () => {},
			onPlayPause: () => {},
			onPrevious: () => {},
			playbackStore,
			track: tracks[1],
			trackIndex: 1,
			tracks,
		});
		const component = instrumented.getComponent();

		let views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const compactBar = views.find((view) => view.getAttribute('id') === 'now-playing-surface-bar');
		compactBar?.getAttribute('onTap')?.();

		views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const firstUpNextHandle = views.find(
			(view) =>
				view.getAttribute('accessibilityLabel') === 'track-row-edit-handle-up-next-track-3-0',
		);
		firstUpNextHandle?.getAttribute('onLongPress')?.({ absoluteY: 0, state: 0 });
		firstUpNextHandle?.getAttribute('onTouch')?.({ absoluteY: 90, state: 2 });

		expect(playbackStore.moveQueueTrack).toHaveBeenCalledWith(2, 3);
	});

	valdiIt('reorders back-to tracks when a queue row is dragged vertically', async () => {
		const playbackStore = mockPlaybackStore({
			moveQueueTrack: jasmine.createSpy('moveQueueTrack'),
			removeFromQueueAt: jasmine.createSpy('removeFromQueueAt'),
		});
		const tracks = [
			{ ...track, id: 'track-1', name: 'Track One' },
			{ ...track, id: 'track-2', name: 'Track Two' },
			{ ...track, id: 'track-3', name: 'Track Three' },
			{ ...track, id: 'track-4', name: 'Track Four' },
		];

		const instrumented = createComponent(NowPlayingSurface, {
			album,
			artistLogoUrl: null,
			barColors: new BarColorStore(),
			collapseSignal: 0,
			isPlaying: true,
			loopMode: 'none',
			onDismiss: () => {},
			onLoopModeToggle: () => {},
			onNext: () => {},
			onPlayPause: () => {},
			onPrevious: () => {},
			playbackStore,
			track: tracks[2],
			trackIndex: 2,
			tracks,
		});
		const component = instrumented.getComponent();

		let views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const compactBar = views.find((view) => view.getAttribute('id') === 'now-playing-surface-bar');
		compactBar?.getAttribute('onTap')?.();

		views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const backToTab = views.find(
			(view) => view.getAttribute('accessibilityLabel') === 'now-playing-tab-back-to',
		);
		backToTab?.getAttribute('onTap')?.();

		views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const firstBackToHandle = views.find(
			(view) =>
				view.getAttribute('accessibilityLabel') === 'track-row-edit-handle-back-to-track-2-0',
		);
		firstBackToHandle?.getAttribute('onLongPress')?.({ absoluteY: 0, state: 0 });
		firstBackToHandle?.getAttribute('onTouch')?.({ absoluteY: 90, state: 2 });

		expect(playbackStore.moveQueueTrack).toHaveBeenCalledWith(1, 0);
	});

	valdiIt('shows bypassed up-next tracks in back-to after jumping ahead in queue', async () => {
		const tracks = [
			{ ...track, id: 'track-1', name: 'Track One' },
			{ ...track, id: 'track-2', name: 'Track Two' },
			{ ...track, id: 'track-3', name: 'Track Three' },
			{ ...track, id: 'track-4', name: 'Track Four' },
		];

		const instrumented = createComponent(NowPlayingSurface, {
			album,
			artistLogoUrl: null,
			barColors: new BarColorStore(),
			collapseSignal: 0,
			isPlaying: true,
			loopMode: 'none',
			onDismiss: () => {},
			onLoopModeToggle: () => {},
			onNext: () => {},
			onPlayPause: () => {},
			onPrevious: () => {},
			playbackStore: mockPlaybackStore(),
			track: tracks[3],
			trackIndex: 3,
			tracks,
		});
		const component = instrumented.getComponent();

		let views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const compactBar = views.find((view) => view.getAttribute('id') === 'now-playing-surface-bar');
		compactBar?.getAttribute('onTap')?.();

		views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const backToTab = views.find(
			(view) => view.getAttribute('accessibilityLabel') === 'now-playing-tab-back-to',
		);
		backToTab?.getAttribute('onTap')?.();

		views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const backToRows = views
			.map((view) => view.getAttribute('accessibilityLabel'))
			.filter((label) => typeof label === 'string' && label.startsWith('track-row-back-to-track-'));

		expect(backToRows).toEqual([
			'track-row-back-to-track-3-0',
			'track-row-back-to-track-2-1',
			'track-row-back-to-track-1-2',
		]);
	});

	valdiIt('caps up-next queue display to thirty tracks', async () => {
		const tracks = createQueueTracks(50);

		const instrumented = createComponent(NowPlayingSurface, {
			album,
			artistLogoUrl: null,
			barColors: new BarColorStore(),
			collapseSignal: 0,
			isPlaying: true,
			loopMode: 'none',
			onDismiss: () => {},
			onLoopModeToggle: () => {},
			onNext: () => {},
			onPlayPause: () => {},
			onPrevious: () => {},
			playbackStore: mockPlaybackStore(),
			track: tracks[0],
			trackIndex: 0,
			tracks,
		});
		const component = instrumented.getComponent();

		let views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const compactBar = views.find((view) => view.getAttribute('id') === 'now-playing-surface-bar');
		compactBar?.getAttribute('onTap')?.();

		views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const upNextRows = views
			.map((view) => view.getAttribute('accessibilityLabel'))
			.filter((label) => typeof label === 'string' && label.startsWith('track-row-up-next-track-'));

		expect(upNextRows.length).toBe(30);
		expect(upNextRows[0]).toBe('track-row-up-next-track-2-0');
		expect(upNextRows[29]).toBe('track-row-up-next-track-31-29');
		expect(upNextRows).not.toContain('track-row-up-next-track-32-30');
	});

	valdiIt('caps back-to queue display to thirty tracks', async () => {
		const tracks = createQueueTracks(80);

		const instrumented = createComponent(NowPlayingSurface, {
			album,
			artistLogoUrl: null,
			barColors: new BarColorStore(),
			collapseSignal: 0,
			isPlaying: true,
			loopMode: 'none',
			onDismiss: () => {},
			onLoopModeToggle: () => {},
			onNext: () => {},
			onPlayPause: () => {},
			onPrevious: () => {},
			playbackStore: mockPlaybackStore(),
			track: tracks[70],
			trackIndex: 70,
			tracks,
		});
		const component = instrumented.getComponent();

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const compactBar = views.find((view) => view.getAttribute('id') === 'now-playing-surface-bar');
		compactBar?.getAttribute('onTap')?.();

		const backToRows = getQueuePageRows(component, 'now-playing-queue-page-back-to');

		expect(backToRows.length).toBe(30);
		expect(backToRows[0]).toBe('track-row-back-to-track-70-0');
		expect(backToRows[29]).toBe('track-row-back-to-track-41-29');
		expect(backToRows).not.toContain('track-row-back-to-track-40-30');
	});

	valdiIt('handles collapse signal update while expanded', async () => {
		const instrumented = createNowPlayingComponent();
		const component = instrumented.getComponent();

		let views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const compactBar = views.find((view) => view.getAttribute('id') === 'now-playing-surface-bar');

		compactBar?.getAttribute('onTap')?.();
		instrumented.setViewModel({
			album,
			artistLogoUrl: null,
			barColors: new BarColorStore(),
			collapseSignal: 1,
			isPlaying: true,
			loopMode: 'none',
			onDismiss: () => {},
			onLoopModeToggle: () => {},
			onNext: () => {},
			onPlayPause: () => {},
			onPrevious: () => {},
			playbackStore: mockPlaybackStore(),
			track,
			trackIndex: 0,
			tracks: [track],
		});

		views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const overlay = views.find((view) => view.getAttribute('id') === 'now-playing-surface-overlay');
		expect(overlay).toBeDefined();
	});

	valdiIt('shows album line year from track productionYear when album is missing', async () => {
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

	valdiIt(
		'derives album line year from track releaseDate when productionYear is missing',
		async () => {
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
		},
	);

	valdiIt('renders artist logo without double-wrapping cache uri', async () => {
		const instrumented = createComponent(NowPlayingSurface, {
			album,
			artistLogoUrl: 'https://example.com/logo.png',
			barColors: new BarColorStore(),
			collapseSignal: 0,
			isPlaying: true,
			loopMode: 'none',
			onDismiss: () => {},
			onLoopModeToggle: () => {},
			onNext: () => {},
			onPlayPause: () => {},
			onPrevious: () => {},
			playbackStore: mockPlaybackStore(),
			track,
			trackIndex: 0,
			tracks: [track],
		});
		const component = instrumented.getComponent();

		const images = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.Image,
		);
		const artistLogoImage = images.find((image) => {
			const src = image.getAttribute('src');
			return typeof src === 'string' && src.includes('c=artist_logo');
		});

		expect(artistLogoImage).toBeDefined();
		const src = artistLogoImage?.getAttribute('src') ?? '';
		expect(src).toContain('u=https%3A%2F%2Fexample.com%2Flogo.png');
		expect(src).not.toContain('u=atolla-cache%3A%2F%2Fimage');
	});

	valdiIt(
		'shows album name without year when playlist track has no valid date metadata',
		async () => {
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
		},
	);

	valdiIt('calls loop mode toggle handler when loop control is tapped', async () => {
		let calls = 0;
		const instrumented = createComponent(NowPlayingSurface, {
			album,
			artistLogoUrl: null,
			barColors: new BarColorStore(),
			collapseSignal: 0,
			isPlaying: true,
			loopMode: 'queue',
			onDismiss: () => {},
			onLoopModeToggle: () => {
				calls += 1;
			},
			onNext: () => {},
			onPlayPause: () => {},
			onPrevious: () => {},
			playbackStore: mockPlaybackStore(),
			track,
			trackIndex: 0,
			tracks: [track],
		});
		const component = instrumented.getComponent();

		let views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const compactBar = views.find((view) => view.getAttribute('id') === 'now-playing-surface-bar');
		compactBar?.getAttribute('onTap')?.();

		views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const loopControl = views.find(
			(view) => view.getAttribute('accessibilityLabel') === 'now-playing-loop-mode',
		);
		loopControl?.getAttribute('onTap')?.();

		expect(calls).toBe(1);
	});

	valdiIt('renders both queue pages simultaneously without requiring a tab switch', async () => {
		const tracks = [
			{ ...track, id: 'track-1', name: 'Track One' },
			{ ...track, id: 'track-2', name: 'Track Two' },
			{ ...track, id: 'track-3', name: 'Track Three' },
			{ ...track, id: 'track-4', name: 'Track Four' },
			{ ...track, id: 'track-5', name: 'Track Five' },
		];

		const instrumented = createComponent(NowPlayingSurface, {
			album,
			artistLogoUrl: null,
			barColors: new BarColorStore(),
			collapseSignal: 0,
			isPlaying: true,
			loopMode: 'none',
			onDismiss: () => {},
			onLoopModeToggle: () => {},
			onNext: () => {},
			onPlayPause: () => {},
			onPrevious: () => {},
			playbackStore: mockPlaybackStore(),
			track: tracks[2],
			trackIndex: 2,
			tracks,
		});
		const component = instrumented.getComponent();

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const compactBar = views.find((view) => view.getAttribute('id') === 'now-playing-surface-bar');
		compactBar?.getAttribute('onTap')?.();

		const backToRows = getQueuePageRows(component, 'now-playing-queue-page-back-to');
		const upNextRows = getQueuePageRows(component, 'now-playing-queue-page-up-next');

		expect(backToRows).toEqual(['track-row-back-to-track-2-0', 'track-row-back-to-track-1-1']);
		expect(upNextRows).toEqual(['track-row-up-next-track-4-0', 'track-row-up-next-track-5-1']);
	});

	valdiIt('queue pages show correct tracks after track changes mid-session', async () => {
		const tracks = createQueueTracks(5);

		const instrumented = createComponent(NowPlayingSurface, {
			album,
			artistLogoUrl: null,
			barColors: new BarColorStore(),
			collapseSignal: 0,
			isPlaying: true,
			loopMode: 'none',
			onDismiss: () => {},
			onLoopModeToggle: () => {},
			onNext: () => {},
			onPlayPause: () => {},
			onPrevious: () => {},
			playbackStore: mockPlaybackStore(),
			track: tracks[1],
			trackIndex: 1,
			tracks,
		});
		const component = instrumented.getComponent();

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const compactBar = views.find((view) => view.getAttribute('id') === 'now-playing-surface-bar');
		compactBar?.getAttribute('onTap')?.();

		instrumented.setViewModel({
			album,
			artistLogoUrl: null,
			barColors: new BarColorStore(),
			collapseSignal: 0,
			isPlaying: true,
			loopMode: 'none',
			onDismiss: () => {},
			onLoopModeToggle: () => {},
			onNext: () => {},
			onPlayPause: () => {},
			onPrevious: () => {},
			playbackStore: mockPlaybackStore(),
			track: tracks[3],
			trackIndex: 3,
			tracks,
		});

		const backToRows = getQueuePageRows(component, 'now-playing-queue-page-back-to');
		const upNextRows = getQueuePageRows(component, 'now-playing-queue-page-up-next');

		expect(backToRows).toEqual([
			'track-row-back-to-track-3-0',
			'track-row-back-to-track-2-1',
			'track-row-back-to-track-1-2',
		]);
		expect(upNextRows).toEqual(['track-row-up-next-track-5-0']);
	});
});
