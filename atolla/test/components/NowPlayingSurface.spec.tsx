import 'jasmine/src/jasmine';
import type { Palette } from 'atolla/src/models/Color';
import { ToastService } from 'atolla/src/services/ToastService';
import { BarColorStore, defaultFooterColors } from 'atolla/src/stores/BarColor';
import type { PlaybackStore } from 'atolla/src/stores/Playback';
import { paletteDefaults, theme, withAlpha } from 'atolla/src/theme';
import {
	NowPlayingSurface,
	type NowPlayingSurfaceViewModel,
} from 'atolla/src/ui/components/NowPlayingSurface';
import { componentGetElements } from 'foundation/test/util/componentGetElements';
import { elementTypeFind } from 'foundation/test/util/elementTypeFind';
import { Component } from 'valdi_core/src/Component';
import { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';
import { DetachedSlotRenderer } from 'valdi_core/src/slot/DetachedSlotRenderer';
import { IRenderedElementViewClass } from 'valdi_test/test/IRenderedElementViewClass';
import { InstrumentedComponentJSX, valdiIt } from 'valdi_test/test/JSXTestUtils';
import { dragEvent, editTextEvent, touchEvent, touchEventWith } from '../util/testEvents';

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
		cycleLoopMode: () => {},
		jumpToIndex: () => {},
		next: () => {},
		playPause: () => {},
		previousOrRestart: () => {},
		progressSeconds: 90,
		seekTo: () => {},
		skipForward: () => {},
		stop: () => {},
		subscribe: () => () => {},
		...overrides,
	} as unknown as PlaybackStore;
}

// NowPlayingSurface drives expand/collapse transitions through setViewModel and mutates internal
// transition state across re-renders, which needs a dedicated per-instance renderer; the shared
// driver renderer (driver.renderComponent) makes those re-renders re-entrant/flaky. root-mount via
// InstrumentedComponentJSX (the non-deprecated primitive createComponent wrapped) to match
// production semantics
function mountNowPlaying(viewModel: object) {
	return InstrumentedComponentJSX.create(NowPlayingSurface, viewModel, undefined);
}

let surfaceUnderTest: NowPlayingSurface | undefined;

class CapturingNowPlayingSurface extends NowPlayingSurface {
	onViewModelUpdate(previousViewModel: NowPlayingSurfaceViewModel): void {
		surfaceUnderTest = this;
		super.onViewModelUpdate(previousViewModel);
	}
}

// renders the surface alongside a DetachedSlotRenderer so slot-rendered modals (context menu,
// create-from-queue) appear in the same component tree as the surface, matching production
class NowPlayingSurfaceWithSlot extends Component<Omit<NowPlayingSurfaceViewModel, 'modalSlot'>> {
	private slot = new DetachedSlot();

	onRender(): void {
		<view>
			<CapturingNowPlayingSurface {...this.viewModel} modalSlot={this.slot} />
			<DetachedSlotRenderer detachedSlot={this.slot} />
		</view>;
	}
}

function mountNowPlayingWithSlot(viewModel: object) {
	surfaceUnderTest = undefined;
	const instrumented = InstrumentedComponentJSX.create(
		NowPlayingSurfaceWithSlot,
		viewModel as Omit<NowPlayingSurfaceViewModel, 'modalSlot'>,
		undefined,
	);
	return { instrumented, surface: (): NowPlayingSurface => surfaceUnderTest as NowPlayingSurface };
}

function openContextMenu(surface: NowPlayingSurface, track: object): void {
	(surface as unknown as { handleTrackLongPress: (t: object) => void }).handleTrackLongPress(track);
}

function createNowPlayingComponent(
	trackOverrides = {},
	albumOverride: typeof album | null = album,
) {
	const mergedTrack = {
		...track,
		...trackOverrides,
	};

	return mountNowPlaying({
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
	return labels.map((label) => label.getAttribute('value') as string);
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
		const instrumented = mountNowPlaying({
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

	valdiIt('keeps the compact progress fill width across re-renders', async () => {
		const instrumented = mountNowPlaying({
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
			playbackStore: mockPlaybackStore({ progressSeconds: 90, track: { duration: 240 } }),
			track,
			trackIndex: 0,
			tracks: [track],
		});
		const component = instrumented.getComponent();

		const getFillWidth = (): string | undefined => {
			const views = elementTypeFind(
				componentGetElements(component),
				IRenderedElementViewClass.View,
			);
			const fill = views.find(
				(view) => view.getAttribute('accessibilityLabel') === 'now-playing-compact-progress-fill',
			);
			return fill?.getAttribute('width') as string | undefined;
		};

		expect(getFillWidth()).toBe('38%');

		// a re-render (e.g. artwork/palette resolving or play state changing at track start)
		// must not reset the imperatively-set width back to 0%
		instrumented.setViewModel({
			album,
			artistLogoUrl: null,
			barColors: new BarColorStore(),
			collapseSignal: 0,
			isPlaying: false,
			loopMode: 'none',
			onDismiss: () => {},
			onLoopModeToggle: () => {},
			onNext: () => {},
			onPlayPause: () => {},
			onPrevious: () => {},
			playbackStore: mockPlaybackStore({ progressSeconds: 90, track: { duration: 240 } }),
			track,
			trackIndex: 0,
			tracks: [track],
		});

		expect(getFillWidth()).toBe('38%');
	});

	valdiIt('shows expanded now-playing view when compact bar is tapped', async () => {
		const instrumented = createNowPlayingComponent();
		const component = instrumented.getComponent();

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const compactBar = views.find((view) => view.getAttribute('id') === 'now-playing-surface-bar');
		const overlay = views.find((view) => view.getAttribute('id') === 'now-playing-surface-overlay');

		expect(overlay?.getAttribute('top')).not.toBe(0);
		compactBar?.getAttribute('onTap')?.(touchEvent);
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
			const instrumented = mountNowPlaying({
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

			compactBar?.getAttribute('onTap')?.(touchEvent);
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

	valdiIt(
		're-tints the bars on a palette change even when a transition flag is stuck',
		async () => {
			const barColors = new BarColorStore();
			const navBarColors: Array<string> = [];
			const headerColors: Array<string> = [];
			barColors.setNavigationBarColor = (color: string) => {
				navBarColors.push(color);
			};
			barColors.setHeaderColor = (color: string) => {
				headerColors.push(color);
			};

			const newPalette: Palette = {
				accent: { hex: '#aabbcc' },
				muted_on_surface: { hex: '#778899' },
				on_surface: { hex: '#445566' },
				surface: { hex: '#112233' },
			};

			const baseViewModel = {
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
				palette: undefined as Palette | undefined,
				playbackStore: mockPlaybackStore(),
				track,
				trackIndex: 0,
				tracks: [track],
			};

			const instrumented = mountNowPlaying(baseViewModel);
			const component = instrumented.getComponent();

			// surface is open, but a backgrounded expand animation never resolved, so the
			// completion callback that clears isTransitioning never ran; the flag is stuck
			component.setState({ isExpanded: true });
			const stuck = component as unknown as {
				isTransitioning: boolean;
				transitionStartedAt: number;
				transitionTarget: 'expanded' | 'collapsed' | null;
			};
			stuck.isTransitioning = true;
			stuck.transitionStartedAt = Date.now() - 5000;
			stuck.transitionTarget = 'expanded';

			// a track change after foregrounding pushes a new palette
			instrumented.setViewModel({ ...baseViewModel, palette: newPalette });

			expect(barColors.footer).toEqual({
				activeIconColor: '#445566',
				background: withAlpha('#112233', 0.8),
				inactiveIconColor: withAlpha('#778899', 0.58),
			});
			expect(headerColors).toContain('#112233');
			expect(navBarColors).toContain('#112233');
		},
	);

	valdiIt('re-opens the surface after a transition flag is left stuck', async () => {
		const instrumented = createNowPlayingComponent();
		const component = instrumented.getComponent();

		const getOverlayTop = () =>
			elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View)
				.find((view) => view.getAttribute('id') === 'now-playing-surface-overlay')
				?.getAttribute('top');

		// collapsed, but a backgrounded transition never cleared its in-progress flag
		const stuck = component as unknown as {
			isTransitioning: boolean;
			transitionStartedAt: number;
			transitionTarget: 'expanded' | 'collapsed' | null;
		};
		stuck.isTransitioning = true;
		stuck.transitionStartedAt = Date.now() - 5000;
		stuck.transitionTarget = 'collapsed';

		expect(getOverlayTop()).not.toBe(0);

		const compactBar = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.View,
		).find((view) => view.getAttribute('id') === 'now-playing-surface-bar');
		compactBar?.getAttribute('onTap')?.(touchEvent);

		expect(getOverlayTop()).toBe(0);
	});

	valdiIt(
		'settles the expanded chrome when a frozen open transition is recovered on foreground',
		async () => {
			const barColors = new BarColorStore();
			const headerColors: Array<string> = [];
			barColors.setHeaderColor = (color: string) => {
				headerColors.push(color);
			};
			barColors.setNavigationBarColor = () => {};

			const palette: Palette = {
				accent: { hex: '#aabbcc' },
				muted_on_surface: { hex: '#778899' },
				on_surface: { hex: '#445566' },
				surface: { hex: '#112233' },
			};

			const baseViewModel = {
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
				palette,
				playbackStore: mockPlaybackStore(),
				track,
				trackIndex: 0,
				tracks: [track],
			};

			const instrumented = mountNowPlaying(baseViewModel);
			const component = instrumented.getComponent();

			// mid-open freeze: the open set isExpanded and the footer/nav-bar colours, but the
			// completion that applies the header colour never ran, leaving the flag stuck
			component.setState({ isExpanded: true });
			const stuck = component as unknown as {
				isTransitioning: boolean;
				transitionStartedAt: number;
				transitionTarget: 'expanded' | 'collapsed' | null;
			};
			stuck.isTransitioning = true;
			stuck.transitionStartedAt = Date.now() - 5000;
			stuck.transitionTarget = 'expanded';
			headerColors.length = 0;

			// foregrounding pushes a fresh view model (same palette, only recovery should re-tint)
			instrumented.setViewModel({ ...baseViewModel });

			expect(headerColors).toContain('#112233');
			expect(stuck.isTransitioning).toBe(false);
		},
	);

	valdiIt(
		'collapses without re-tinting expanded colours when a frozen close is recovered',
		async () => {
			const barColors = new BarColorStore();
			barColors.setHeaderColor = () => {};
			barColors.setNavigationBarColor = () => {};

			const newPalette: Palette = {
				accent: { hex: '#aabbcc' },
				muted_on_surface: { hex: '#778899' },
				on_surface: { hex: '#445566' },
				surface: { hex: '#112233' },
			};

			const baseViewModel = {
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
				palette: undefined as Palette | undefined,
				playbackStore: mockPlaybackStore(),
				track,
				trackIndex: 0,
				tracks: [track],
			};

			const instrumented = mountNowPlaying(baseViewModel);
			const component = instrumented.getComponent();

			// mid-close freeze: the close reset the chrome and set the flag, but the completion that
			// flips isExpanded false never ran, so the surface still reports itself as expanded
			component.setState({ isExpanded: true });
			const stuck = component as unknown as {
				isTransitioning: boolean;
				transitionStartedAt: number;
				transitionTarget: 'expanded' | 'collapsed' | null;
			};
			stuck.isTransitioning = true;
			stuck.transitionStartedAt = Date.now() - 5000;
			stuck.transitionTarget = 'collapsed';

			// a track change on foreground pushes a new palette
			instrumented.setViewModel({ ...baseViewModel, palette: newPalette });

			expect(component.state.isExpanded).toBe(false);
			expect(barColors.footer).toEqual(defaultFooterColors);
		},
	);

	valdiIt(
		'ignores a stale transition completion that resolves after it was superseded',
		async () => {
			const barColors = new BarColorStore();
			const headerColors: Array<string> = [];
			barColors.setHeaderColor = (color: string) => {
				headerColors.push(color);
			};
			barColors.setNavigationBarColor = () => {};

			const palette: Palette = {
				accent: { hex: '#aabbcc' },
				muted_on_surface: { hex: '#778899' },
				on_surface: { hex: '#445566' },
				surface: { hex: '#112233' },
			};

			const instrumented = mountNowPlaying({
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
				palette,
				playbackStore: mockPlaybackStore(),
				track,
				trackIndex: 0,
				tracks: [track],
			});
			const component = instrumented.getComponent();

			// start an open; its completion chain is now pending (animations run synchronously in tests)
			elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View)
				.find((view) => view.getAttribute('id') === 'now-playing-surface-bar')
				?.getAttribute('onTap')?.(touchEvent);

			// the open was abandoned by a freeze and a newer generation has since superseded it, the way
			// recovery (or a fresh transition) bumps the generation
			const internals = component as unknown as {
				transitionGeneration: number;
				isTransitioning: boolean;
			};
			internals.transitionGeneration += 1;
			internals.isTransitioning = false;
			headerColors.length = 0;

			// let the superseded completion resolve
			await new Promise((resolve) => setTimeout(resolve, 0));

			// the stale completion must not re-apply the expanded header colour
			expect(headerColors).toEqual([]);
		},
	);

	valdiIt(
		'holds the previous palette colours while the next track palette is still loading',
		async () => {
			const barColors = new BarColorStore();
			const headerColors: Array<string> = [];
			const navBarColors: Array<string> = [];
			barColors.setHeaderColor = (color: string) => {
				headerColors.push(color);
			};
			barColors.setNavigationBarColor = (color: string) => {
				navBarColors.push(color);
			};

			const paletteA: Palette = {
				accent: { hex: '#aabbcc' },
				muted_on_surface: { hex: '#778899' },
				on_surface: { hex: '#445566' },
				surface: { hex: '#112233' },
			};
			const paletteB: Palette = {
				accent: { hex: '#0a0b0c' },
				muted_on_surface: { hex: '#998877' },
				on_surface: { hex: '#665544' },
				surface: { hex: '#221100' },
			};

			const baseViewModel = {
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
				palette: paletteA as Palette | undefined,
				playbackStore: mockPlaybackStore(),
				track,
				trackIndex: 0,
				tracks: [track],
			};

			const instrumented = mountNowPlaying(baseViewModel);
			const component = instrumented.getComponent();

			elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View)
				.find((view) => view.getAttribute('id') === 'now-playing-surface-bar')
				?.getAttribute('onTap')?.(touchEvent);
			// let the expand transition settle so the bars are tinted to palette A
			await new Promise((resolve) => setTimeout(resolve, 0));

			headerColors.length = 0;
			navBarColors.length = 0;
			const paletteAFooter = {
				activeIconColor: '#445566',
				background: withAlpha('#112233', 0.8),
				inactiveIconColor: withAlpha('#778899', 0.58),
			};
			expect(barColors.footer).toEqual(paletteAFooter);

			// track change: the new palette hasn't been extracted yet (prop is undefined). the chrome
			// must not flash to the default colours; it holds palette A until the new palette arrives
			instrumented.setViewModel({ ...baseViewModel, palette: undefined });

			expect(headerColors).toEqual([]);
			expect(navBarColors).toEqual([]);
			expect(barColors.footer).toEqual(paletteAFooter);

			// once the new palette is available, the chrome re-tints to it
			instrumented.setViewModel({ ...baseViewModel, palette: paletteB });

			expect(headerColors).toContain('#221100');
			expect(barColors.footer).toEqual({
				activeIconColor: '#665544',
				background: withAlpha('#221100', 0.8),
				inactiveIconColor: withAlpha('#998877', 0.58),
			});
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

		const { instrumented, surface } = mountNowPlayingWithSlot({
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

		openContextMenu(surface(), track);

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const addToQueueAction = views.find(
			(view) => view.getAttribute('accessibilityLabel') === 'track-context-add-to-queue',
		);
		addToQueueAction?.getAttribute('onTap')?.(touchEvent);

		expect(addToQueueCalls).toBe(1);
		expect(toastService.getMessage()).toBe('added to queue');
	});

	valdiIt('context menu artist tap targets the selected track, not the playing one', async () => {
		let capturedArtistTrack: { artistId?: string; id?: string } | undefined;
		const contextTrack = {
			albumId: 'album-2',
			albumImageUrl: 'https://example.com/other.jpg',
			albumName: 'Other Album',
			artistId: 'artist-2',
			artistName: 'Other Artist',
			duration: 200,
			id: 'track-2',
			name: 'Other Track',
		};
		const transport = {
			getArtistLogoUrl: () => Promise.resolve(null),
		};

		const { instrumented, surface } = mountNowPlayingWithSlot({
			album,
			artistLogoUrl: null,
			barColors: new BarColorStore(),
			collapseSignal: 0,
			isPlaying: true,
			loopMode: 'none',
			onArtistTap: (t: { artistId?: string; id?: string }) => {
				capturedArtistTrack = t;
			},
			onDismiss: () => {},
			onLoopModeToggle: () => {},
			onNext: () => {},
			onPlayPause: () => {},
			onPrevious: () => {},
			playbackStore: mockPlaybackStore(),
			toastService: new ToastService(),
			track,
			trackIndex: 0,
			tracks: [track],
			transport,
		});
		const component = instrumented.getComponent();
		openContextMenu(surface(), contextTrack);

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const artistLogo = views.find(
			(view) => view.getAttribute('accessibilityLabel') === 'track-context-artist-logo',
		);
		artistLogo?.getAttribute('onTap')?.(touchEvent);
		await Promise.resolve();
		await Promise.resolve();

		expect(capturedArtistTrack?.id).toBe('track-2');
		expect(capturedArtistTrack?.artistId).toBe('artist-2');
	});

	valdiIt('context menu album tap targets the selected track album', async () => {
		let capturedAlbumTrack: { albumId?: string; id?: string } | undefined;
		const contextTrack = {
			albumId: 'album-2',
			albumImageUrl: 'https://example.com/other.jpg',
			albumName: 'Other Album',
			artistId: 'artist-2',
			artistName: 'Other Artist',
			duration: 200,
			id: 'track-2',
			name: 'Other Track',
		};
		const transport = {
			getArtistLogoUrl: () => Promise.resolve(null),
		};

		const { instrumented, surface } = mountNowPlayingWithSlot({
			album,
			artistLogoUrl: null,
			barColors: new BarColorStore(),
			collapseSignal: 0,
			isPlaying: true,
			loopMode: 'none',
			onAlbumTap: (t: { albumId?: string; id?: string }) => {
				capturedAlbumTrack = t;
			},
			onDismiss: () => {},
			onLoopModeToggle: () => {},
			onNext: () => {},
			onPlayPause: () => {},
			onPrevious: () => {},
			playbackStore: mockPlaybackStore(),
			toastService: new ToastService(),
			track,
			trackIndex: 0,
			tracks: [track],
			transport,
		});
		const component = instrumented.getComponent();
		openContextMenu(surface(), contextTrack);

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const albumRow = views.find(
			(view) => view.getAttribute('accessibilityLabel') === 'track-row-swipe-region-track-2-0',
		);
		albumRow?.getAttribute('onTap')?.(touchEvent);
		await Promise.resolve();
		await Promise.resolve();

		expect(capturedAlbumTrack?.id).toBe('track-2');
		expect(capturedAlbumTrack?.albumId).toBe('album-2');
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

			const instrumented = mountNowPlaying({
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
			compactBar?.getAttribute('onTap')?.(touchEvent);

			views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
			const artworkTouch = views.find(
				(view) =>
					view.getAttribute('accessibilityLabel') === 'track-row-swipe-region-up-next-track-3-0',
			);
			artworkTouch?.getAttribute('onTouch')?.(touchEventWith({ state: 0 }));
			jasmine.clock().tick(500);

			views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
			const upNextRowSwipeRegion = views.find(
				(view) =>
					view.getAttribute('accessibilityLabel') === 'track-row-swipe-region-up-next-track-3-0',
			);
			upNextRowSwipeRegion?.getAttribute('onDrag')?.(
				dragEvent({
					deltaX: -72,
					deltaY: 0,
					state: 1,
					velocityX: -100,
				}),
			);
			upNextRowSwipeRegion?.getAttribute('onDrag')?.(
				dragEvent({
					deltaX: -72,
					deltaY: 0,
					state: 2,
					velocityX: -100,
				}),
			);

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

		const instrumented = mountNowPlaying({
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
		compactBar?.getAttribute('onTap')?.(touchEvent);

		views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const firstUpNextHandle = views.find(
			(view) =>
				view.getAttribute('accessibilityLabel') === 'track-row-edit-handle-up-next-track-3-0',
		);
		firstUpNextHandle?.getAttribute('onLongPress')?.(touchEventWith({ absoluteY: 0, state: 0 }));
		firstUpNextHandle?.getAttribute('onTouch')?.(touchEventWith({ absoluteY: 90, state: 2 }));

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

		const instrumented = mountNowPlaying({
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
		compactBar?.getAttribute('onTap')?.(touchEvent);

		views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const backToTab = views.find(
			(view) => view.getAttribute('accessibilityLabel') === 'now-playing-tab-back-to',
		);
		backToTab?.getAttribute('onTap')?.(touchEvent);

		views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const firstBackToHandle = views.find(
			(view) =>
				view.getAttribute('accessibilityLabel') === 'track-row-edit-handle-back-to-track-2-0',
		);
		firstBackToHandle?.getAttribute('onLongPress')?.(touchEventWith({ absoluteY: 0, state: 0 }));
		firstBackToHandle?.getAttribute('onTouch')?.(touchEventWith({ absoluteY: 90, state: 2 }));

		expect(playbackStore.moveQueueTrack).toHaveBeenCalledWith(1, 0);
	});

	valdiIt('shows bypassed up-next tracks in back-to after jumping ahead in queue', async () => {
		const tracks = [
			{ ...track, id: 'track-1', name: 'Track One' },
			{ ...track, id: 'track-2', name: 'Track Two' },
			{ ...track, id: 'track-3', name: 'Track Three' },
			{ ...track, id: 'track-4', name: 'Track Four' },
		];

		const instrumented = mountNowPlaying({
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
		compactBar?.getAttribute('onTap')?.(touchEvent);

		views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const backToTab = views.find(
			(view) => view.getAttribute('accessibilityLabel') === 'now-playing-tab-back-to',
		);
		backToTab?.getAttribute('onTap')?.(touchEvent);

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

		const instrumented = mountNowPlaying({
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
		compactBar?.getAttribute('onTap')?.(touchEvent);

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

		const instrumented = mountNowPlaying({
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
		compactBar?.getAttribute('onTap')?.(touchEvent);

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

		compactBar?.getAttribute('onTap')?.(touchEvent);
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
		const instrumented = mountNowPlaying({
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

	valdiIt('renders injected artwork sources instead of the cache-scheme url', async () => {
		const instrumented = mountNowPlaying({
			album,
			albumArtworkSource: 'preview://artwork',
			artistLogoUrl: null,
			barColors: new BarColorStore(),
			blurredArtworkSource: 'preview://artwork-blurred',
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
		const srcs = images.map((image) => image.getAttribute('src'));

		expect(srcs).toContain('preview://artwork');
		expect(srcs).toContain('preview://artwork-blurred');
		expect(srcs.every((src) => typeof src !== 'string' || !src.includes('atolla-cache'))).toBe(
			true,
		);
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

	valdiIt('cycles loop mode when loop control is tapped', async () => {
		let calls = 0;
		const instrumented = mountNowPlaying({
			album,
			artistLogoUrl: null,
			barColors: new BarColorStore(),
			collapseSignal: 0,
			isPlaying: true,
			loopMode: 'queue',
			playbackStore: mockPlaybackStore({
				cycleLoopMode: () => {
					calls += 1;
				},
			}),
			track,
			trackIndex: 0,
			tracks: [track],
		});
		const component = instrumented.getComponent();

		let views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const compactBar = views.find((view) => view.getAttribute('id') === 'now-playing-surface-bar');
		compactBar?.getAttribute('onTap')?.(touchEvent);

		views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const loopControl = views.find(
			(view) => view.getAttribute('accessibilityLabel') === 'now-playing-loop-mode',
		);
		loopControl?.getAttribute('onTap')?.(touchEvent);

		expect(calls).toBe(1);
	});

	// both the compact and expanded time labels are written on every 5Hz progress tick, but only
	// one pair is ever on screen
	valdiIt('writes only the visible time labels while collapsed', async () => {
		const playbackStore = mockPlaybackStore({
			progressSeconds: 90,
			track: { duration: 240 },
		}) as unknown as { progressSeconds: number };

		const instrumented = mountNowPlaying({
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
			track,
			trackIndex: 0,
			tracks: [track],
		});
		const component = instrumented.getComponent();

		playbackStore.progressSeconds = 120;
		(component as unknown as { updateProgressRefs(): void }).updateProgressRefs();

		const labelValues = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.Label,
		).map((label) => label.getAttribute('value'));
		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const fillWidth = views
			.find(
				(view) => view.getAttribute('accessibilityLabel') === 'now-playing-compact-progress-fill',
			)
			?.getAttribute('width');

		expect(fillWidth).toBe('50%');
		expect(labelValues).toContain('2:00 / 4:00');
		expect(labelValues).not.toContain('2:00');
		expect(labelValues).not.toContain('-2:00');
	});

	// the surface stays mounted while collapsed, parked off-screen at top 2000. rendering the
	// queue there costs up to 60 rows on every playback tick for something nobody can see
	valdiIt('does not render queue rows while collapsed', async () => {
		const tracks = createQueueTracks(60);

		const instrumented = mountNowPlaying({
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
			track: tracks[30],
			trackIndex: 30,
			tracks,
		});
		const component = instrumented.getComponent();

		expect(getQueuePageRows(component, 'now-playing-queue-page-back-to')).toEqual([]);
		expect(getQueuePageRows(component, 'now-playing-queue-page-up-next')).toEqual([]);

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		views
			.find((view) => view.getAttribute('id') === 'now-playing-surface-bar')
			?.getAttribute('onTap')?.(touchEvent);

		expect(getQueuePageRows(component, 'now-playing-queue-page-up-next').length).toBeGreaterThan(0);
	});

	valdiIt('renders both queue pages simultaneously without requiring a tab switch', async () => {
		const tracks = [
			{ ...track, id: 'track-1', name: 'Track One' },
			{ ...track, id: 'track-2', name: 'Track Two' },
			{ ...track, id: 'track-3', name: 'Track Three' },
			{ ...track, id: 'track-4', name: 'Track Four' },
			{ ...track, id: 'track-5', name: 'Track Five' },
		];

		const instrumented = mountNowPlaying({
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
		compactBar?.getAttribute('onTap')?.(touchEvent);

		const backToRows = getQueuePageRows(component, 'now-playing-queue-page-back-to');
		const upNextRows = getQueuePageRows(component, 'now-playing-queue-page-up-next');

		expect(backToRows).toEqual(['track-row-back-to-track-2-0', 'track-row-back-to-track-1-1']);
		expect(upNextRows).toEqual(['track-row-up-next-track-4-0', 'track-row-up-next-track-5-1']);
	});

	valdiIt('queue pages show correct tracks after track changes mid-session', async () => {
		const tracks = createQueueTracks(5);

		const instrumented = mountNowPlaying({
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
		compactBar?.getAttribute('onTap')?.(touchEvent);

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

	valdiIt(
		'shows a create-playlist-from-queue button on the queue tabs row when expanded',
		async () => {
			const tracks = createQueueTracks(3);
			const { instrumented } = mountNowPlayingWithSlot({
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

			const views = elementTypeFind(
				componentGetElements(component),
				IRenderedElementViewClass.View,
			);
			const compactBar = views.find(
				(view) => view.getAttribute('id') === 'now-playing-surface-bar',
			);
			compactBar?.getAttribute('onTap')?.(touchEvent);

			const expandedViews = elementTypeFind(
				componentGetElements(component),
				IRenderedElementViewClass.View,
			);
			const createButton = expandedViews.find(
				(v) => v.getAttribute('accessibilityLabel') === 'now-playing-create-playlist-from-queue',
			);
			expect(createButton).toBeDefined();

			createButton?.getAttribute('onTap')?.(touchEvent);

			expect(getLabelValues(component)).toContain('CREATE PLAYLIST FROM QUEUE');
		},
	);

	valdiIt(
		'collapses the surface and opens the playlist after creating from the queue',
		async () => {
			const tracks = createQueueTracks(3);
			let openedPlaylist: { id: string; name: string } | undefined;
			const transport = {
				addItemsToPlaylist: () => Promise.resolve(),
				createPlaylist: (name: string) => Promise.resolve({ id: 'pl-new', name }),
			};
			const { instrumented, surface } = mountNowPlayingWithSlot({
				album,
				artistLogoUrl: null,
				barColors: new BarColorStore(),
				collapseSignal: 0,
				isPlaying: true,
				loopMode: 'none',
				onDismiss: () => {},
				onLoopModeToggle: () => {},
				onNext: () => {},
				onOpenPlaylist: (playlist: { id: string; name: string }) => {
					openedPlaylist = playlist;
				},
				onPlayPause: () => {},
				onPrevious: () => {},
				playbackStore: mockPlaybackStore(),
				toastService: new ToastService(),
				track: tracks[1],
				trackIndex: 1,
				tracks,
				transport,
			});
			const component = instrumented.getComponent();

			const findView = (accessibilityLabel: string) =>
				elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View).find(
					(v) => v.getAttribute('accessibilityLabel') === accessibilityLabel,
				);

			elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View)
				.find((v) => v.getAttribute('id') === 'now-playing-surface-bar')
				?.getAttribute('onTap')?.(touchEvent);
			// let the expand transition settle so isTransitioning resets before we collapse
			await new Promise((resolve) => setTimeout(resolve, 0));
			findView('now-playing-create-playlist-from-queue')?.getAttribute('onTap')?.(touchEvent);

			elementTypeFind(
				componentGetElements(component),
				IRenderedElementViewClass.TextField,
			)[0]?.getAttribute('onChange')?.(editTextEvent('My Queue Playlist'));
			findView('create-playlist-from-queue-create-btn')?.getAttribute('onTap')?.(touchEvent);

			await new Promise((resolve) => setTimeout(resolve, 0));

			expect(openedPlaylist).toEqual({ id: 'pl-new', name: 'My Queue Playlist' });
			expect(surface().state.isExpanded).toBe(false);
		},
	);
});
