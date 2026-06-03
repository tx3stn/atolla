import 'jasmine/src/jasmine';
import { theme } from 'atolla/src/theme';
import type { TrackListEntry } from 'atolla/src/ui/components/TrackList';
import { TrackList } from 'atolla/src/ui/components/TrackList';
import { componentGetElements } from 'foundation/test/util/componentGetElements';
import { elementTypeFind } from 'foundation/test/util/elementTypeFind';
import { IRenderedElementViewClass } from 'valdi_test/test/IRenderedElementViewClass';
import { createComponent, valdiIt } from 'valdi_test/test/JSXTestUtils';

describe('TrackList', () => {
	valdiIt('shows empty state when no tracks are provided', async () => {
		const instrumented = createComponent(TrackList, { tracks: [] });
		const component = instrumented.getComponent();

		const labels = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.Label,
		);
		expect(labels.length).toBe(1);
		expect(labels[0].getAttribute('value')).toBe('nothing else lined up');
	});

	valdiIt('renders a row for each track', async () => {
		const tracks = [
			{ id: 'a', meta: '3:00', title: 'Song One' },
			{ id: 'b', meta: '4:30', title: 'Song Two' },
		];
		const instrumented = createComponent(TrackList, { tracks });
		const component = instrumented.getComponent();

		const rows = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		expect(rows.some((row) => row.getAttribute('accessibilityLabel') === 'track-row-a-0')).toBe(
			true,
		);
		expect(rows.some((row) => row.getAttribute('accessibilityLabel') === 'track-row-b-1')).toBe(
			true,
		);
	});

	valdiIt('renders track title and meta labels', async () => {
		const tracks = [{ id: 'a', meta: '2:15', title: 'Track Name' }];
		const instrumented = createComponent(TrackList, { tracks });
		const component = instrumented.getComponent();

		const labels = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.Label,
		);
		const values = labels.map((l) => l.getAttribute('value'));
		expect(values).toContain('Track Name');
		expect(values).toContain('2:15');
	});

	valdiIt('uses tail ellipsis for truncated title and meta text', async () => {
		const tracks = [{ id: 'a', meta: 'Very long metadata line', title: 'Very long track title' }];
		const instrumented = createComponent(TrackList, { tracks });
		const component = instrumented.getComponent();

		const labels = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.Label,
		);
		const title = labels.find((label) => label.getAttribute('value') === 'Very long track title');
		const meta = labels.find((label) => label.getAttribute('value') === 'Very long metadata line');

		expect(title?.getAttribute('textOverflow')).toBe('ellipsis');
		expect(title?.getAttribute('numberOfLines')).toBe(2);
		expect(meta?.getAttribute('textOverflow')).toBe('ellipsis');
		expect(meta?.getAttribute('numberOfLines')).toBe(1);
	});

	valdiIt('calls onTrackTap with track id when row is tapped', async () => {
		const tracks = [{ id: 'track-1', meta: '1:00', title: 'Tap Me' }];
		let tappedId = '';
		const instrumented = createComponent(TrackList, {
			onTrackTap: (id: string) => {
				tappedId = id;
			},
			tracks,
		});
		const component = instrumented.getComponent();

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const swipeRegion = views.find(
			(view) => view.getAttribute('accessibilityLabel') === 'track-row-swipe-region-track-1-0',
		);
		swipeRegion?.getAttribute('onTap')?.();

		expect(tappedId).toBe('track-1');
	});

	valdiIt('calls onTrackLongPress when artwork is long pressed', async () => {
		jasmine.clock().install();
		try {
			const track = {
				artistName: 'Artist',
				duration: 180,
				id: 'track-1',
				name: 'Track One',
			};
			let longPressedTrackId: string | null = null;
			const instrumented = createComponent(TrackList, {
				onTrackLongPress: (pressedTrack: { id: string }) => {
					longPressedTrackId = pressedTrack.id;
				},
				tracks: [
					{
						artworkSource: 'https://example.com/art.jpg',
						id: track.id,
						meta: 'Artist',
						title: track.name,
						track,
					},
				],
			});
			const component = instrumented.getComponent();

			const views = elementTypeFind(
				componentGetElements(component),
				IRenderedElementViewClass.View,
			);
			const swipeRegion = views.find(
				(view) => view.getAttribute('accessibilityLabel') === 'track-row-swipe-region-track-1-0',
			);
			swipeRegion?.getAttribute('onTouch')?.({ state: 0 });
			jasmine.clock().tick(500);

			expect(longPressedTrackId as string | null).toBe('track-1');
		} finally {
			jasmine.clock().uninstall();
		}
	});

	valdiIt('calls onTrackLongPress when non-artwork region is long pressed', async () => {
		jasmine.clock().install();
		try {
			const track = {
				artistName: 'Artist',
				duration: 180,
				id: 'track-1',
				name: 'Track One',
			};
			let longPressedTrackId: string | null = null;
			const instrumented = createComponent(TrackList, {
				onTrackLongPress: (pressedTrack: { id: string }) => {
					longPressedTrackId = pressedTrack.id;
				},
				tracks: [
					{
						id: track.id,
						leadingLabel: '1',
						meta: 'Artist',
						title: track.name,
						track,
					},
				],
			});
			const component = instrumented.getComponent();

			const views = elementTypeFind(
				componentGetElements(component),
				IRenderedElementViewClass.View,
			);
			const swipeRegion = views.find(
				(view) => view.getAttribute('accessibilityLabel') === 'track-row-swipe-region-track-1-0',
			);
			swipeRegion?.getAttribute('onTouch')?.({ state: 0 });
			jasmine.clock().tick(500);

			expect(longPressedTrackId as string | null).toBe('track-1');
		} finally {
			jasmine.clock().uninstall();
		}
	});

	valdiIt('keeps long press active while touch state changes', async () => {
		jasmine.clock().install();
		try {
			const track = {
				artistName: 'Artist',
				duration: 180,
				id: 'track-1',
				name: 'Track One',
			};
			let longPressedTrackId: string | null = null;
			const instrumented = createComponent(TrackList, {
				onTrackLongPress: (pressedTrack: { id: string }) => {
					longPressedTrackId = pressedTrack.id;
				},
				tracks: [
					{
						id: track.id,
						leadingLabel: '1',
						meta: 'Artist',
						title: track.name,
						track,
					},
				],
			});
			const component = instrumented.getComponent();

			const views = elementTypeFind(
				componentGetElements(component),
				IRenderedElementViewClass.View,
			);
			const swipeRegion = views.find(
				(view) => view.getAttribute('accessibilityLabel') === 'track-row-swipe-region-track-1-0',
			);
			swipeRegion?.getAttribute('onTouch')?.({ state: 0 });
			swipeRegion?.getAttribute('onTouch')?.({ state: 1 });
			jasmine.clock().tick(500);

			expect(longPressedTrackId as string | null).toBe('track-1');
		} finally {
			jasmine.clock().uninstall();
		}
	});

	valdiIt('keeps handle tap active while swipe remove is enabled', async () => {
		const track = {
			artistName: 'Artist',
			duration: 180,
			id: 'track-1',
			name: 'Track One',
		};
		let removedTrackId: string | null = null;
		let removedEntryIndex: number | null = null;
		let longPressedTrackId: string | null = null;
		const instrumented = createComponent(TrackList, {
			onTrackLongPress: (pressedTrack: { id: string }) => {
				longPressedTrackId = pressedTrack.id;
			},
			onTrackSwipeRemove: (trackId: string, entryIndex: number) => {
				removedTrackId = trackId;
				removedEntryIndex = entryIndex;
			},
			showDragHandles: true,
			tracks: [
				{
					artworkSource: 'https://example.com/art.jpg',
					id: track.id,
					meta: 'Artist',
					title: track.name,
					track,
				},
			],
		});
		const component = instrumented.getComponent();

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const handle = views.find(
			(view) => view.getAttribute('accessibilityLabel') === 'track-row-edit-handle-track-1-0',
		);
		handle?.getAttribute('onTap')?.();

		const swipeRegion = views.find(
			(view) => view.getAttribute('accessibilityLabel') === 'track-row-swipe-region-track-1-0',
		);
		swipeRegion?.getAttribute('onDrag')?.({ deltaX: -70, deltaY: 0, state: 1, velocityX: -100 });
		swipeRegion?.getAttribute('onDrag')?.({ deltaX: -70, deltaY: 0, state: 2, velocityX: -100 });

		expect(longPressedTrackId as string | null).toBe('track-1');
		expect(removedTrackId as string | null).toBe('track-1');
		expect(removedEntryIndex as number | null).toBe(0);
	});

	valdiIt('reveals a destructive remove icon as row is swiped', async () => {
		const tracks = [{ id: 'track-1', meta: '1:00', title: 'Swipe Me' }];
		const instrumented = createComponent(TrackList, {
			onTrackSwipeRemove: () => {},
			showDragHandles: true,
			tracks,
		});
		const component = instrumented.getComponent();
		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const removeAction = views.find(
			(view) => view.getAttribute('accessibilityLabel') === 'track-row-remove-action-track-1-0',
		);
		expect(removeAction?.getAttribute('style').attributes.opacity).toBe(0);

		const swipeRegion = views.find(
			(view) => view.getAttribute('accessibilityLabel') === 'track-row-swipe-region-track-1-0',
		);
		swipeRegion?.getAttribute('onDrag')?.({ deltaX: -44, deltaY: 0, state: 1, velocityX: -100 });
		expect(removeAction?.getAttribute('opacity')).toBeGreaterThan(0);

		const images = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.Image,
		);
		const removeIcon = images.find(
			(image) => image.getAttribute('accessibilityLabel') === 'track-row-remove-icon-track-1-0',
		);

		expect(removeIcon).toBeDefined();
		expect(removeIcon?.getAttribute('tint')).toBe(theme.colors.destructive);
	});

	valdiIt('calls onTrackReorder when dragging handle vertically', async () => {
		const reordered: Array<number> = [];
		const tracks = [
			{ id: 'track-1', meta: '1:00', title: 'One' },
			{ id: 'track-2', meta: '1:10', title: 'Two' },
			{ id: 'track-3', meta: '1:20', title: 'Three' },
		];
		const instrumented = createComponent(TrackList, {
			holdToReorder: false,
			onTrackReorder: (fromIndex: number, toIndex: number) => {
				reordered.push(fromIndex, toIndex);
			},
			showDragHandles: true,
			tracks,
		});
		const component = instrumented.getComponent();

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const dragContainer = views.find(
			(view) => view.getAttribute('accessibilityLabel') === 'track-row-drag-track-1-0',
		);
		dragContainer?.getAttribute('onDrag')?.({ deltaX: 0, deltaY: 70, state: 2, velocityY: 120 });

		expect(reordered).toEqual([0, 1]);
	});

	valdiIt('moves the row visually while dragging the reorder handle', async () => {
		const tracks = [
			{ id: 'track-1', meta: '1:00', title: 'One' },
			{ id: 'track-2', meta: '1:10', title: 'Two' },
		];
		const instrumented = createComponent(TrackList, {
			holdToReorder: false,
			onTrackReorder: () => {},
			showDragHandles: true,
			tracks,
		});
		const component = instrumented.getComponent();

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const dragContainer = views.find(
			(view) => view.getAttribute('accessibilityLabel') === 'track-row-drag-track-1-0',
		);
		const row = views.find(
			(view) => view.getAttribute('accessibilityLabel') === 'track-row-track-1-0',
		);

		dragContainer?.getAttribute('onDrag')?.({ deltaX: 0, deltaY: 42, state: 1, velocityY: 0 });
		expect(dragContainer?.getAttribute('top')).toBe(42);
		expect(dragContainer?.getAttribute('bottom')).toBe(-42);
		expect(row?.getAttribute('zIndex')).toBe(20);
		expect(row?.getAttribute('backgroundColor')).toBe('rgba(45,120,206,0.28)');

		dragContainer?.getAttribute('onDrag')?.({ deltaX: 0, deltaY: 42, state: 2, velocityY: 90 });
		expect(dragContainer?.getAttribute('top')).toBe(72);
		expect(dragContainer?.getAttribute('bottom')).toBe(-72);
		expect(row?.getAttribute('zIndex')).toBe(0);
		expect(row?.getAttribute('backgroundColor')).toBe(theme.colors.bg);
	});

	valdiIt('clamps handle drag reorder to list boundaries', async () => {
		let fromIndex: number | null = null;
		let toIndex: number | null = null;
		const tracks = [
			{ id: 'track-1', meta: '1:00', title: 'One' },
			{ id: 'track-2', meta: '1:10', title: 'Two' },
			{ id: 'track-3', meta: '1:20', title: 'Three' },
		];
		const instrumented = createComponent(TrackList, {
			holdToReorder: false,
			onTrackReorder: (from: number, to: number) => {
				fromIndex = from;
				toIndex = to;
			},
			showDragHandles: true,
			tracks,
		});
		const component = instrumented.getComponent();

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const dragContainer = views.find(
			(view) => view.getAttribute('accessibilityLabel') === 'track-row-drag-track-2-1',
		);
		dragContainer?.getAttribute('onDrag')?.({ deltaX: 0, deltaY: -300, state: 2, velocityY: -800 });

		expect(fromIndex as number | null).toBe(1);
		expect(toIndex as number | null).toBe(0);
	});

	valdiIt('auto-scrolls when a row is dragged to the viewport edge', async () => {
		const scrollCalls: Array<number> = [];
		const dragScroller = {
			scrollBy: (delta: number) => {
				scrollCalls.push(delta);
				return delta;
			},
			setScrollEnabled: () => {},
			viewport: () => ({ bottom: 100, top: 0 }),
		};
		const tracks = [
			{ id: 'track-1', meta: '1:00', title: 'One' },
			{ id: 'track-2', meta: '1:10', title: 'Two' },
			{ id: 'track-3', meta: '1:20', title: 'Three' },
		];
		const instrumented = createComponent(TrackList, {
			dragScroller,
			holdToReorder: false,
			onTrackReorder: () => {},
			showDragHandles: true,
			tracks,
		});
		const component = instrumented.getComponent();

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const dragContainer = views.find(
			(view) => view.getAttribute('accessibilityLabel') === 'track-row-drag-track-1-0',
		);

		// absoluteY 96 sits inside the bottom edge zone of a 0..100 viewport.
		dragContainer?.getAttribute('onDrag')?.({
			absoluteY: 96,
			deltaX: 0,
			deltaY: 40,
			state: 1,
			velocityY: 0,
		});

		expect(scrollCalls.length).toBeGreaterThan(0);
		expect(scrollCalls[0]).toBeGreaterThan(0);

		// End the drag so the auto-scroll timer is cleared.
		dragContainer?.getAttribute('onDrag')?.({
			absoluteY: 96,
			deltaX: 0,
			deltaY: 40,
			state: 2,
			velocityY: 0,
		});
	});

	describe('hold to reorder', () => {
		const tracks = [
			{ id: 'track-1', meta: '1:00', title: 'One' },
			{ id: 'track-2', meta: '1:10', title: 'Two' },
			{ id: 'track-3', meta: '1:20', title: 'Three' },
		];

		valdiIt('arms with the handle long press instead of a row drag', async () => {
			const instrumented = createComponent(TrackList, {
				holdToReorder: true,
				onTrackReorder: () => {},
				showDragHandles: true,
				tracks,
			});
			const views = elementTypeFind(
				componentGetElements(instrumented.getComponent()),
				IRenderedElementViewClass.View,
			);

			const dragContainer = views.find(
				(view) => view.getAttribute('accessibilityLabel') === 'track-row-drag-track-1-0',
			);
			const handle = views.find(
				(view) => view.getAttribute('accessibilityLabel') === 'track-row-edit-handle-track-1-0',
			);

			expect(dragContainer?.getAttribute('onDrag')).toBeUndefined();
			expect(dragContainer?.getAttribute('onDragDisabled')).toBe(true);
			expect(handle?.getAttribute('onLongPress')).toBeDefined();
			expect(handle?.getAttribute('onLongPressDisabled')).toBe(false);
		});

		valdiIt('calls onTrackReorder after long press arm and touch movement', async () => {
			const reordered: Array<number> = [];
			const instrumented = createComponent(TrackList, {
				holdToReorder: true,
				onTrackReorder: (fromIndex: number, toIndex: number) => {
					reordered.push(fromIndex, toIndex);
				},
				showDragHandles: true,
				tracks,
			});
			const views = elementTypeFind(
				componentGetElements(instrumented.getComponent()),
				IRenderedElementViewClass.View,
			);
			const handle = views.find(
				(view) => view.getAttribute('accessibilityLabel') === 'track-row-edit-handle-track-1-0',
			);

			handle?.getAttribute('onLongPress')?.({ absoluteY: 10, state: 0 });
			handle?.getAttribute('onTouch')?.({ absoluteY: 80, state: 1 });
			handle?.getAttribute('onTouch')?.({ absoluteY: 80, state: 2 });

			expect(reordered).toEqual([0, 1]);
		});

		valdiIt('moves the row visually while the armed handle is touched', async () => {
			const instrumented = createComponent(TrackList, {
				holdToReorder: true,
				onTrackReorder: () => {},
				showDragHandles: true,
				tracks,
			});
			const views = elementTypeFind(
				componentGetElements(instrumented.getComponent()),
				IRenderedElementViewClass.View,
			);
			const dragContainer = views.find(
				(view) => view.getAttribute('accessibilityLabel') === 'track-row-drag-track-1-0',
			);
			const row = views.find(
				(view) => view.getAttribute('accessibilityLabel') === 'track-row-track-1-0',
			);
			const handle = views.find(
				(view) => view.getAttribute('accessibilityLabel') === 'track-row-edit-handle-track-1-0',
			);

			handle?.getAttribute('onLongPress')?.({ absoluteY: 10, state: 0 });
			expect(row?.getAttribute('backgroundColor')).toBe('rgba(45,120,206,0.28)');
			// zIndex must stay untouched mid-gesture: Valdi applies it by re-inserting
			// the native view, which cancels the in-flight touch on iOS.
			expect(row?.getAttribute('zIndex')).toBeUndefined();

			handle?.getAttribute('onTouch')?.({ absoluteY: 52, state: 1 });
			expect(dragContainer?.getAttribute('top')).toBe(42);
			expect(dragContainer?.getAttribute('bottom')).toBe(-42);
		});

		valdiIt('suspends scrolling while armed and restores it after release', async () => {
			const scrollEnabledCalls: Array<boolean> = [];
			const dragScroller = {
				scrollBy: () => 0,
				setScrollEnabled: (enabled: boolean) => {
					scrollEnabledCalls.push(enabled);
				},
				viewport: () => undefined,
			};
			const instrumented = createComponent(TrackList, {
				dragScroller,
				holdToReorder: true,
				onTrackReorder: () => {},
				showDragHandles: true,
				tracks,
			});
			const views = elementTypeFind(
				componentGetElements(instrumented.getComponent()),
				IRenderedElementViewClass.View,
			);
			const handle = views.find(
				(view) => view.getAttribute('accessibilityLabel') === 'track-row-edit-handle-track-1-0',
			);

			handle?.getAttribute('onLongPress')?.({ absoluteY: 10, state: 0 });
			expect(scrollEnabledCalls).toEqual([false]);

			handle?.getAttribute('onTouch')?.({ absoluteY: 80, state: 2 });
			expect(scrollEnabledCalls).toEqual([false, true]);
		});

		valdiIt('does not reorder when released without movement', async () => {
			const reordered: Array<number> = [];
			const scrollEnabledCalls: Array<boolean> = [];
			const dragScroller = {
				scrollBy: () => 0,
				setScrollEnabled: (enabled: boolean) => {
					scrollEnabledCalls.push(enabled);
				},
				viewport: () => undefined,
			};
			const instrumented = createComponent(TrackList, {
				dragScroller,
				holdToReorder: true,
				onTrackReorder: (fromIndex: number, toIndex: number) => {
					reordered.push(fromIndex, toIndex);
				},
				showDragHandles: true,
				tracks,
			});
			const views = elementTypeFind(
				componentGetElements(instrumented.getComponent()),
				IRenderedElementViewClass.View,
			);
			const handle = views.find(
				(view) => view.getAttribute('accessibilityLabel') === 'track-row-edit-handle-track-1-0',
			);

			handle?.getAttribute('onLongPress')?.({ absoluteY: 10, state: 0 });
			handle?.getAttribute('onTouch')?.({ absoluteY: 10, state: 2 });

			expect(reordered).toEqual([]);
			expect(scrollEnabledCalls).toEqual([false, true]);
		});

		valdiIt('ignores handle touches when not armed', async () => {
			const reordered: Array<number> = [];
			const instrumented = createComponent(TrackList, {
				holdToReorder: true,
				onTrackReorder: (fromIndex: number, toIndex: number) => {
					reordered.push(fromIndex, toIndex);
				},
				showDragHandles: true,
				tracks,
			});
			const views = elementTypeFind(
				componentGetElements(instrumented.getComponent()),
				IRenderedElementViewClass.View,
			);
			const dragContainer = views.find(
				(view) => view.getAttribute('accessibilityLabel') === 'track-row-drag-track-1-0',
			);
			const handle = views.find(
				(view) => view.getAttribute('accessibilityLabel') === 'track-row-edit-handle-track-1-0',
			);

			handle?.getAttribute('onTouch')?.({ absoluteY: 10, state: 0 });
			handle?.getAttribute('onTouch')?.({ absoluteY: 80, state: 1 });
			handle?.getAttribute('onTouch')?.({ absoluteY: 80, state: 2 });

			expect(reordered).toEqual([]);
			expect(dragContainer?.getAttribute('top')).toBeUndefined();
		});
	});

	valdiIt('renders leading label when no artwork is provided', async () => {
		const tracks = [{ id: 'a', leadingLabel: '1', meta: '1:00', title: 'Track' }];
		const instrumented = createComponent(TrackList, { tracks });
		const component = instrumented.getComponent();

		const labels = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.Label,
		);
		const values = labels.map((l) => l.getAttribute('value'));
		expect(values).toContain('1');
	});

	valdiIt('updates when tracks viewModel changes', async () => {
		const instrumented = createComponent(TrackList, { tracks: [] as Array<TrackListEntry> });
		const component = instrumented.getComponent();

		let labels = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.Label);
		expect(labels[0].getAttribute('value')).toBe('nothing else lined up');

		instrumented.setViewModel({ tracks: [{ id: 'x', meta: '5:00', title: 'New Track' }] });
		labels = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.Label);
		const values = labels.map((l) => l.getAttribute('value'));
		expect(values).toContain('New Track');
	});

	valdiIt('applies palette colors to row and labels when palette is provided', async () => {
		const palette = {
			accent: { hex: '#f43f5e' },
			muted_on_surface: { hex: '#d8cc99' },
			on_surface: { hex: '#ffeeaa' },
			primary: { hex: '#ff6600' },
			surface: { hex: '#223344' },
		};
		const tracks = [{ id: 'a', meta: '2:15', title: 'Track Name' }];
		const instrumented = createComponent(TrackList, { palette, tracks });
		const component = instrumented.getComponent();

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const row = views.find((view) => view.getAttribute('accessibilityLabel') === 'track-row-a-0');
		expect(row?.getAttribute('style').attributes.backgroundColor).toBe('#223344');

		const labels = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.Label,
		);
		const title = labels.find((label) => label.getAttribute('value') === 'Track Name');
		const meta = labels.find((label) => label.getAttribute('value') === '2:15');
		expect(title?.getAttribute('style').attributes.color).toBe('#ffeeaa');
		expect(meta?.getAttribute('style').attributes.color).toBe('#d8cc99');
	});

	valdiIt('falls back to theme colors when palette is not provided', async () => {
		const tracks = [{ id: 'a', meta: '2:15', title: 'Track Name' }];
		const instrumented = createComponent(TrackList, { tracks });
		const component = instrumented.getComponent();

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const row = views.find((view) => view.getAttribute('accessibilityLabel') === 'track-row-a-0');
		expect(row?.getAttribute('style').attributes.backgroundColor).toBe(theme.colors.bg);
	});
});
