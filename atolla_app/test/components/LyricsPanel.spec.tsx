import 'jasmine/src/jasmine';
import { paletteDefaults } from 'atolla_app/src/theme';
import { LyricsPanel, LyricsStatuses } from 'atolla_app/src/ui/components/LyricsPanel';
import type { Lyrics } from 'atolla_core/src/models/Lyrics';
import type { PlaybackStore } from 'atolla_player/src/stores/Playback';
import { elementTypeFind } from 'foundation/test/util/elementTypeFind';
import { IRenderedElementViewClass } from 'valdi_test/test/IRenderedElementViewClass';
import { valdiIt } from 'valdi_test/test/JSXTestUtils';
import { scrollEvent, styleAttribute } from '../util/testEvents';

const lyrics: Lyrics = {
	lines: [{ text: 'first line' }, { text: '' }, { text: 'third line' }],
	synced: false,
};

const syncedLyrics: Lyrics = {
	lines: [
		{ startSeconds: 3, text: 'line at 3s' },
		{ startSeconds: 5, text: 'line at 5s' },
		{ startSeconds: 7, text: 'line at 7s' },
		{ startSeconds: 9, text: 'line at 9s' },
	],
	synced: true,
};

// a progress source the test drives by hand: advanceTo() moves the clock and fires the
// subscription, the same shape NowPlayingSurface's real playbackStore presents to the panel
function fakePlayback(progressSeconds = 0) {
	const listeners: Array<() => void> = [];
	const store = {
		progressSeconds,
		subscribe: (listener: () => void) => {
			listeners.push(listener);
			return () => {
				listeners.splice(listeners.indexOf(listener), 1);
			};
		},
	};

	return {
		advanceTo(seconds: number): void {
			store.progressSeconds = seconds;
			for (const listener of [...listeners]) {
				listener();
			}
		},
		store: store as unknown as PlaybackStore,
	};
}

type Elements = Parameters<typeof elementTypeFind>[0];

// the current line is the one drawn in the accent colour; its text says which line that is
function activeLineText(all: Elements): string | undefined {
	return elementTypeFind(all, IRenderedElementViewClass.Label)
		.find((label) => styleAttribute(label, 'color') === paletteDefaults.accent)
		?.getAttribute('value') as string | undefined;
}

function scrollElement(all: Elements) {
	return elementTypeFind(all, IRenderedElementViewClass.ScrollView)[0];
}

// contentOffsetY lives on ScrollViewInteractive (programmatic-only), which the element's
// getAttribute typing doesn't cover
function scrollOffset(all: Elements): unknown {
	const scroll = scrollElement(all) as unknown as
		| { getAttribute: (name: string) => unknown }
		| undefined;
	return scroll?.getAttribute('contentOffsetY');
}

function layoutPanel(all: Elements, viewportHeight: number, lineTops: Array<number>): void {
	scrollElement(all)?.getAttribute('onLayout')?.({
		height: viewportHeight,
		width: 300,
		x: 0,
		y: 0,
	});

	const labels = elementTypeFind(all, IRenderedElementViewClass.Label);
	for (const [index, top] of lineTops.entries()) {
		labels
			.find((label) => label.getAttribute('accessibilityLabel') === `lyrics-line-${index}`)
			?.getAttribute('onLayout')?.({ height: 20, width: 300, x: 0, y: top });
	}
}

describe('LyricsPanel', () => {
	valdiIt('renders a line per lyric and keeps verse breaks as spacing', async (driver) => {
		const component = driver.renderComponent(
			LyricsPanel,
			{
				accessibilityId: 'lyrics',
				bottomPadding: 0,
				horizontalPadding: 14,
				lyrics,
				status: LyricsStatuses.loaded,
				topPadding: 0,
			},
			undefined,
		);

		const labels = elementTypeFind(
			component.renderer.getComponentRootElements(component, true),
			IRenderedElementViewClass.Label,
		);

		expect(labels.map((label) => label.getAttribute('value'))).toEqual([
			'first line',
			'third line',
		]);
		expect(labels.map((label) => label.getAttribute('accessibilityLabel'))).toEqual([
			'lyrics-line-0',
			'lyrics-line-2',
		]);
	});

	valdiIt('reports a track the server has no lyrics for', async (driver) => {
		const component = driver.renderComponent(
			LyricsPanel,
			{
				accessibilityId: 'lyrics',
				bottomPadding: 0,
				horizontalPadding: 14,
				lyrics: null,
				status: LyricsStatuses.loaded,
				topPadding: 0,
			},
			undefined,
		);

		const views = elementTypeFind(
			component.renderer.getComponentRootElements(component, true),
			IRenderedElementViewClass.View,
		);
		const labels = elementTypeFind(
			component.renderer.getComponentRootElements(component, true),
			IRenderedElementViewClass.Label,
		);

		expect(
			views.find((view) => view.getAttribute('accessibilityLabel') === 'lyrics-empty'),
		).toBeDefined();
		expect(labels.map((label) => label.getAttribute('value'))).toEqual([
			'no lyrics for this track',
		]);
	});

	valdiIt('treats an empty line list as no lyrics', async (driver) => {
		const component = driver.renderComponent(
			LyricsPanel,
			{
				accessibilityId: 'lyrics',
				bottomPadding: 0,
				horizontalPadding: 14,
				lyrics: { lines: [], synced: false },
				status: LyricsStatuses.loaded,
				topPadding: 0,
			},
			undefined,
		);

		const views = elementTypeFind(
			component.renderer.getComponentRootElements(component, true),
			IRenderedElementViewClass.View,
		);

		expect(
			views.find((view) => view.getAttribute('accessibilityLabel') === 'lyrics-empty'),
		).toBeDefined();
	});

	valdiIt('distinguishes a failed fetch from an absent one', async (driver) => {
		const component = driver.renderComponent(
			LyricsPanel,
			{
				accessibilityId: 'lyrics',
				bottomPadding: 0,
				horizontalPadding: 14,
				lyrics: null,
				status: LyricsStatuses.failed,
				topPadding: 0,
			},
			undefined,
		);

		const views = elementTypeFind(
			component.renderer.getComponentRootElements(component, true),
			IRenderedElementViewClass.View,
		);
		const labels = elementTypeFind(
			component.renderer.getComponentRootElements(component, true),
			IRenderedElementViewClass.Label,
		);

		expect(
			views.find((view) => view.getAttribute('accessibilityLabel') === 'lyrics-failed'),
		).toBeDefined();
		expect(labels.map((label) => label.getAttribute('value'))).toEqual(['failed to load lyrics']);
	});

	valdiIt('highlights the line matching the current playback position', async (driver) => {
		const playback = fakePlayback();
		const component = driver.renderComponent(
			LyricsPanel,
			{
				accessibilityId: 'lyrics',
				bottomPadding: 0,
				horizontalPadding: 14,
				lyrics: syncedLyrics,
				playbackStore: playback.store,
				status: LyricsStatuses.loaded,
				topPadding: 0,
			},
			undefined,
		);

		expect(
			activeLineText(component.renderer.getComponentRootElements(component, true)),
		).toBeUndefined();

		playback.advanceTo(6);

		expect(activeLineText(component.renderer.getComponentRootElements(component, true))).toBe(
			'line at 5s',
		);
	});

	valdiIt('moves the highlight on as playback crosses the next timestamp', async (driver) => {
		const playback = fakePlayback();
		const component = driver.renderComponent(
			LyricsPanel,
			{
				accessibilityId: 'lyrics',
				bottomPadding: 0,
				horizontalPadding: 14,
				lyrics: syncedLyrics,
				playbackStore: playback.store,
				status: LyricsStatuses.loaded,
				topPadding: 0,
			},
			undefined,
		);

		playback.advanceTo(6);
		playback.advanceTo(9);

		expect(activeLineText(component.renderer.getComponentRootElements(component, true))).toBe(
			'line at 9s',
		);
	});

	valdiIt('highlights nothing for unsynced lyrics even while playing', async (driver) => {
		const playback = fakePlayback();
		const component = driver.renderComponent(
			LyricsPanel,
			{
				accessibilityId: 'lyrics',
				bottomPadding: 0,
				horizontalPadding: 14,
				lyrics,
				playbackStore: playback.store,
				status: LyricsStatuses.loaded,
				topPadding: 0,
			},
			undefined,
		);

		playback.advanceTo(30);

		expect(
			activeLineText(component.renderer.getComponentRootElements(component, true)),
		).toBeUndefined();
	});

	valdiIt(
		'highlights nothing without a playback store, as the modal renders it',
		async (driver) => {
			const component = driver.renderComponent(
				LyricsPanel,
				{
					accessibilityId: 'lyrics',
					bottomPadding: 0,
					horizontalPadding: 14,
					lyrics: syncedLyrics,
					status: LyricsStatuses.loaded,
					topPadding: 0,
				},
				undefined,
			);

			expect(
				activeLineText(component.renderer.getComponentRootElements(component, true)),
			).toBeUndefined();
		},
	);

	valdiIt('scrolls the active line towards the anchor as it advances', async (driver) => {
		const playback = fakePlayback();
		const component = driver.renderComponent(
			LyricsPanel,
			{
				accessibilityId: 'lyrics',
				bottomPadding: 0,
				horizontalPadding: 14,
				lyrics: syncedLyrics,
				playbackStore: playback.store,
				status: LyricsStatuses.loaded,
				topPadding: 0,
			},
			undefined,
		);
		layoutPanel(
			component.renderer.getComponentRootElements(component, true),
			200,
			[0, 100, 200, 300],
		);

		playback.advanceTo(9);

		// line 3 sits at 300; the anchor puts it 0.4 of the viewport down from the top
		expect(scrollOffset(component.renderer.getComponentRootElements(component, true))).toBe(220);
	});

	valdiIt('does not scroll above the top of the lyrics', async (driver) => {
		const playback = fakePlayback();
		const component = driver.renderComponent(
			LyricsPanel,
			{
				accessibilityId: 'lyrics',
				bottomPadding: 0,
				horizontalPadding: 14,
				lyrics: syncedLyrics,
				playbackStore: playback.store,
				status: LyricsStatuses.loaded,
				topPadding: 0,
			},
			undefined,
		);
		layoutPanel(
			component.renderer.getComponentRootElements(component, true),
			200,
			[0, 100, 200, 300],
		);

		playback.advanceTo(3);

		expect(scrollOffset(component.renderer.getComponentRootElements(component, true))).toBe(0);
	});

	valdiIt(
		'stops following once the user scrolls, and resumes off the playback clock',
		async (driver) => {
			const playback = fakePlayback();
			const component = driver.renderComponent(
				LyricsPanel,
				{
					accessibilityId: 'lyrics',
					bottomPadding: 0,
					horizontalPadding: 14,
					lyrics: syncedLyrics,
					playbackStore: playback.store,
					status: LyricsStatuses.loaded,
					topPadding: 0,
				},
				undefined,
			);
			layoutPanel(
				component.renderer.getComponentRootElements(component, true),
				200,
				[0, 100, 200, 300],
			);

			playback.advanceTo(5);
			const offsetBeforeDrag = scrollOffset(
				component.renderer.getComponentRootElements(component, true),
			);

			scrollElement(component.renderer.getComponentRootElements(component, true))?.getAttribute(
				'onDragStart',
			)?.(scrollEvent({}));
			playback.advanceTo(7);

			expect(scrollOffset(component.renderer.getComponentRootElements(component, true))).toBe(
				offsetBeforeDrag,
			);
			// the highlight keeps up even while the scroll is left alone
			expect(activeLineText(component.renderer.getComponentRootElements(component, true))).toBe(
				'line at 7s',
			);

			// suspended until 5 + 5s of playback, so this tick is past the resume point
			playback.advanceTo(11);

			expect(scrollOffset(component.renderer.getComponentRootElements(component, true))).toBe(220);
		},
	);

	valdiIt('shows neither lyrics nor an empty state while loading', async (driver) => {
		const component = driver.renderComponent(
			LyricsPanel,
			{
				accessibilityId: 'lyrics',
				bottomPadding: 0,
				horizontalPadding: 14,
				lyrics: null,
				status: LyricsStatuses.loading,
				topPadding: 0,
			},
			undefined,
		);

		const views = elementTypeFind(
			component.renderer.getComponentRootElements(component, true),
			IRenderedElementViewClass.View,
		);

		expect(
			views.find((view) => view.getAttribute('accessibilityLabel') === 'lyrics-empty'),
		).toBeUndefined();
		expect(
			views.find((view) => view.getAttribute('accessibilityLabel') === 'lyrics-line-0'),
		).toBeUndefined();
	});

	valdiIt('forwards its scroll offset so a host can tell it is at the top', async (driver) => {
		const offsets: Array<number> = [];
		const component = driver.renderComponent(
			LyricsPanel,
			{
				accessibilityId: 'lyrics',
				bottomPadding: 0,
				horizontalPadding: 14,
				lyrics,
				onScrollOffset: (y: number) => {
					offsets.push(y);
				},
				status: LyricsStatuses.loaded,
				topPadding: 0,
			},
			undefined,
		);

		const scroll = scrollElement(component.renderer.getComponentRootElements(component, true));
		scroll?.getAttribute('onScroll')?.(scrollEvent({ y: 140 }));
		scroll?.getAttribute('onScroll')?.(scrollEvent({ y: 0 }));

		expect(offsets).toEqual([140, 0]);
	});
});
