import 'jasmine/src/jasmine';
import { theme } from 'atolla/src/theme';
import type { TrackListEntry } from 'atolla/src/ui/components/TrackList';
import { TrackList } from 'atolla/src/ui/components/TrackList';
import { componentGetElements } from 'foundation/test/util/componentGetElements';
import { elementTypeFind } from 'foundation/test/util/elementTypeFind';
import { IRenderedElementViewClass } from 'valdi_test/test/IRenderedElementViewClass';
import { valdiIt } from 'valdi_test/test/JSXTestUtils';
import { dragEvent, styleAttribute, touchEvent, touchEventWith } from '../util/testEvents';

describe('TrackList', () => {
	valdiIt('shows empty state when no tracks are provided', async (driver) => {
		const component = driver.renderComponent(TrackList, { tracks: [] }, undefined);

		const labels = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.Label,
		);
		expect(labels.length).toBe(1);
		expect(labels[0].getAttribute('value')).toBe('nothing else lined up');
	});

	valdiIt('renders a row for each track', async (driver) => {
		const tracks = [
			{ id: 'a', meta: '3:00', title: 'Song One' },
			{ id: 'b', meta: '4:30', title: 'Song Two' },
		];
		const component = driver.renderComponent(TrackList, { tracks }, undefined);

		const rows = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		expect(rows.some((row) => row.getAttribute('accessibilityLabel') === 'track-row-a-0')).toBe(
			true,
		);
		expect(rows.some((row) => row.getAttribute('accessibilityLabel') === 'track-row-b-1')).toBe(
			true,
		);
	});

	valdiIt('renders track title and meta labels', async (driver) => {
		const tracks = [{ id: 'a', meta: '2:15', title: 'Track Name' }];
		const component = driver.renderComponent(TrackList, { tracks }, undefined);

		const labels = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.Label,
		);
		const values = labels.map((l) => l.getAttribute('value'));
		expect(values).toContain('Track Name');
		expect(values).toContain('2:15');
	});

	valdiIt('shows the full title and tail-ellipsises only the meta line', async (driver) => {
		const tracks = [{ id: 'a', meta: 'Very long metadata line', title: 'Very long track title' }];
		const component = driver.renderComponent(TrackList, { tracks }, undefined);

		const labels = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.Label,
		);
		const title = labels.find((label) => label.getAttribute('value') === 'Very long track title');
		const meta = labels.find((label) => label.getAttribute('value') === 'Very long metadata line');

		// title is unbounded (numberOfLines 0) so the full string is shown, never truncated
		expect(title?.getAttribute('numberOfLines')).toBe(0);
		// the meta stays a single tail-ellipsised line
		expect(meta?.getAttribute('textOverflow')).toBe('ellipsis');
		expect(meta?.getAttribute('numberOfLines')).toBe(1);
	});

	valdiIt('calls onTrackTap with track id when row is tapped', async (driver) => {
		const tracks = [{ id: 'track-1', meta: '1:00', title: 'Tap Me' }];
		let tappedId = '';
		const component = driver.renderComponent(
			TrackList,
			{
				onTrackTap: (id: string) => {
					tappedId = id;
				},
				tracks,
			},
			undefined,
		);

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const swipeRegion = views.find(
			(view) => view.getAttribute('accessibilityLabel') === 'track-row-swipe-region-track-1-0',
		);
		swipeRegion?.getAttribute('onTap')?.(touchEvent);

		expect(tappedId).toBe('track-1');
	});

	valdiIt('calls onTrackLongPress when artwork is long pressed', async (driver) => {
		jasmine.clock().install();
		try {
			const track = {
				artistName: 'Artist',
				duration: 180,
				id: 'track-1',
				name: 'Track One',
			};
			let longPressedTrackId: string | null = null;
			const component = driver.renderComponent(
				TrackList,
				{
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
				},
				undefined,
			);

			const views = elementTypeFind(
				componentGetElements(component),
				IRenderedElementViewClass.View,
			);
			const swipeRegion = views.find(
				(view) => view.getAttribute('accessibilityLabel') === 'track-row-swipe-region-track-1-0',
			);
			swipeRegion?.getAttribute('onTouch')?.(touchEventWith({ state: 0 }));
			jasmine.clock().tick(500);

			expect(longPressedTrackId as string | null).toBe('track-1');
		} finally {
			jasmine.clock().uninstall();
		}
	});

	valdiIt('calls onTrackLongPress when non-artwork region is long pressed', async (driver) => {
		jasmine.clock().install();
		try {
			const track = {
				artistName: 'Artist',
				duration: 180,
				id: 'track-1',
				name: 'Track One',
			};
			let longPressedTrackId: string | null = null;
			const component = driver.renderComponent(
				TrackList,
				{
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
				},
				undefined,
			);

			const views = elementTypeFind(
				componentGetElements(component),
				IRenderedElementViewClass.View,
			);
			const swipeRegion = views.find(
				(view) => view.getAttribute('accessibilityLabel') === 'track-row-swipe-region-track-1-0',
			);
			swipeRegion?.getAttribute('onTouch')?.(touchEventWith({ state: 0 }));
			jasmine.clock().tick(500);

			expect(longPressedTrackId as string | null).toBe('track-1');
		} finally {
			jasmine.clock().uninstall();
		}
	});

	valdiIt('keeps long press active while touch state changes', async (driver) => {
		jasmine.clock().install();
		try {
			const track = {
				artistName: 'Artist',
				duration: 180,
				id: 'track-1',
				name: 'Track One',
			};
			let longPressedTrackId: string | null = null;
			const component = driver.renderComponent(
				TrackList,
				{
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
				},
				undefined,
			);

			const views = elementTypeFind(
				componentGetElements(component),
				IRenderedElementViewClass.View,
			);
			const swipeRegion = views.find(
				(view) => view.getAttribute('accessibilityLabel') === 'track-row-swipe-region-track-1-0',
			);
			swipeRegion?.getAttribute('onTouch')?.(touchEventWith({ state: 0 }));
			swipeRegion?.getAttribute('onTouch')?.(touchEventWith({ state: 1 }));
			jasmine.clock().tick(500);

			expect(longPressedTrackId as string | null).toBe('track-1');
		} finally {
			jasmine.clock().uninstall();
		}
	});

	valdiIt('keeps handle tap active while swipe remove is enabled', async (driver) => {
		const track = {
			artistName: 'Artist',
			duration: 180,
			id: 'track-1',
			name: 'Track One',
		};
		let removedTrackId: string | null = null;
		let removedEntryIndex: number | null = null;
		let longPressedTrackId: string | null = null;
		const component = driver.renderComponent(
			TrackList,
			{
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
			},
			undefined,
		);

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const handle = views.find(
			(view) => view.getAttribute('accessibilityLabel') === 'track-row-edit-handle-track-1-0',
		);
		handle?.getAttribute('onTap')?.(touchEvent);

		const swipeRegion = views.find(
			(view) => view.getAttribute('accessibilityLabel') === 'track-row-swipe-region-track-1-0',
		);
		swipeRegion?.getAttribute('onDrag')?.(
			dragEvent({ deltaX: -70, deltaY: 0, state: 1, velocityX: -100 }),
		);
		swipeRegion?.getAttribute('onDrag')?.(
			dragEvent({ deltaX: -70, deltaY: 0, state: 2, velocityX: -100 }),
		);

		expect(longPressedTrackId as string | null).toBe('track-1');
		expect(removedTrackId as string | null).toBe('track-1');
		expect(removedEntryIndex as number | null).toBe(0);
	});

	valdiIt('reveals a destructive remove icon as row is swiped', async (driver) => {
		const tracks = [{ id: 'track-1', meta: '1:00', title: 'Swipe Me' }];
		const component = driver.renderComponent(
			TrackList,
			{
				onTrackSwipeRemove: () => {},
				showDragHandles: true,
				tracks,
			},
			undefined,
		);
		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const removeAction = views.find(
			(view) => view.getAttribute('accessibilityLabel') === 'track-row-remove-action-track-1-0',
		);
		expect(styleAttribute(removeAction, 'opacity')).toBe(0);

		const swipeRegion = views.find(
			(view) => view.getAttribute('accessibilityLabel') === 'track-row-swipe-region-track-1-0',
		);
		swipeRegion?.getAttribute('onDrag')?.(
			dragEvent({ deltaX: -44, deltaY: 0, state: 1, velocityX: -100 }),
		);
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

	valdiIt('calls onTrackReorder when dragging handle vertically', async (driver) => {
		const reordered: Array<number> = [];
		const tracks = [
			{ id: 'track-1', meta: '1:00', title: 'One' },
			{ id: 'track-2', meta: '1:10', title: 'Two' },
			{ id: 'track-3', meta: '1:20', title: 'Three' },
		];
		const component = driver.renderComponent(
			TrackList,
			{
				holdToReorder: false,
				onTrackReorder: (fromIndex: number, toIndex: number) => {
					reordered.push(fromIndex, toIndex);
				},
				showDragHandles: true,
				tracks,
			},
			undefined,
		);

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const dragContainer = views.find(
			(view) => view.getAttribute('accessibilityLabel') === 'track-row-drag-track-1-0',
		);
		dragContainer?.getAttribute('onDrag')?.(
			dragEvent({ deltaX: 0, deltaY: 70, state: 2, velocityY: 120 }),
		);

		expect(reordered).toEqual([0, 1]);
	});

	valdiIt('persists a reorder computed from real measured row frames', async (driver) => {
		const reordered: Array<number> = [];
		const tracks = [
			{ id: 'a', meta: '1:00', title: 'A' },
			{ id: 'b', meta: '1:10', title: 'B' },
			{ id: 'c', meta: '1:20', title: 'C' },
			{ id: 'd', meta: '1:30', title: 'D' },
		];
		const component = driver.renderComponent(
			TrackList,
			{
				holdToReorder: false,
				onTrackReorder: (from: number, to: number) => {
					reordered.push(from, to);
				},
				showDragHandles: true,
				tracks,
			},
			undefined,
		);

		// lay the list out so rows have real, stacked frames: the path the bazel fallback
		// (uniform synthetic slots) never exercises, and where the device drop must resolve
		await driver.performLayout({ height: 800, width: 320 });

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const findView = (label: string) =>
			views.find((view) => view.getAttribute('accessibilityLabel') === label);
		const rowHeight =
			(findView('track-row-drag-b-1')?.frame?.y ?? 0) -
			(findView('track-row-drag-a-0')?.frame?.y ?? 0);
		expect(rowHeight).toBeGreaterThan(0);

		// drag row 0 down two rows and release: it must land at index 2, not snap back
		const rowZero = findView('track-row-drag-a-0');
		const dropDeltaY = rowHeight * 2;
		rowZero?.getAttribute('onDrag')?.(dragEvent({ deltaX: 0, deltaY: 0, state: 0, velocityY: 0 }));
		rowZero?.getAttribute('onDrag')?.(
			dragEvent({ deltaX: 0, deltaY: dropDeltaY, state: 1, velocityY: 0 }),
		);
		rowZero?.getAttribute('onDrag')?.(
			dragEvent({ deltaX: 0, deltaY: dropDeltaY, state: 2, velocityY: 90 }),
		);

		expect(reordered).toEqual([0, 2]);
	});

	valdiIt('persists a hold-to-reorder drop computed from real measured frames', async (driver) => {
		const reordered: Array<number> = [];
		const tracks = [
			{ id: 'a', meta: '1:00', title: 'A' },
			{ id: 'b', meta: '1:10', title: 'B' },
			{ id: 'c', meta: '1:20', title: 'C' },
			{ id: 'd', meta: '1:30', title: 'D' },
		];
		const component = driver.renderComponent(
			TrackList,
			{
				holdToReorder: true,
				onTrackReorder: (from: number, to: number) => {
					reordered.push(from, to);
				},
				showDragHandles: true,
				tracks,
			},
			undefined,
		);

		await driver.performLayout({ height: 800, width: 320 });

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const findView = (label: string) =>
			views.find((view) => view.getAttribute('accessibilityLabel') === label);
		const rowHeight =
			(findView('track-row-drag-b-1')?.frame?.y ?? 0) -
			(findView('track-row-drag-a-0')?.frame?.y ?? 0);
		expect(rowHeight).toBeGreaterThan(0);

		// iOS arms on a handle long-press, then reads movement from the handle's touch stream:
		// the synthesized deltaY (absoluteY - armedOriginY) must resolve against the
		// list-relative slot tops
		const handleA = findView('track-row-edit-handle-a-0');
		const originY = 200;
		handleA?.getAttribute('onLongPress')?.(touchEventWith({ absoluteY: originY, state: 0 }));
		handleA?.getAttribute('onTouch')?.(
			touchEventWith({ absoluteY: originY + rowHeight * 2, state: 1 }),
		);
		handleA?.getAttribute('onTouch')?.(
			touchEventWith({ absoluteY: originY + rowHeight * 2, state: 2 }),
		);

		expect(reordered).toEqual([0, 2]);
	});

	valdiIt('moves the row visually while dragging the reorder handle', async (driver) => {
		const tracks = [
			{ id: 'track-1', meta: '1:00', title: 'One' },
			{ id: 'track-2', meta: '1:10', title: 'Two' },
		];
		const component = driver.renderComponent(
			TrackList,
			{
				holdToReorder: false,
				onTrackReorder: () => {},
				showDragHandles: true,
				tracks,
			},
			undefined,
		);

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const dragContainer = views.find(
			(view) => view.getAttribute('accessibilityLabel') === 'track-row-drag-track-1-0',
		);
		const row = views.find(
			(view) => view.getAttribute('accessibilityLabel') === 'track-row-track-1-0',
		);

		dragContainer?.getAttribute('onDrag')?.(
			dragEvent({ deltaX: 0, deltaY: 42, state: 1, velocityY: 0 }),
		);
		expect(dragContainer?.getAttribute('top')).toBe(42);
		expect(dragContainer?.getAttribute('bottom')).toBe(-42);
		expect(row?.getAttribute('zIndex')).toBe(20);
		expect(row?.getAttribute('backgroundColor')).toBe('rgba(45,120,206,0.28)');

		dragContainer?.getAttribute('onDrag')?.(
			dragEvent({ deltaX: 0, deltaY: 42, state: 2, velocityY: 90 }),
		);
		expect(dragContainer?.getAttribute('top')).toBe(72);
		expect(dragContainer?.getAttribute('bottom')).toBe(-72);
		expect(row?.getAttribute('zIndex')).toBe(0);
		expect(row?.getAttribute('backgroundColor')).toBe(theme.colors.bg);
	});

	valdiIt('clamps handle drag reorder to list boundaries', async (driver) => {
		let fromIndex: number | null = null;
		let toIndex: number | null = null;
		const tracks = [
			{ id: 'track-1', meta: '1:00', title: 'One' },
			{ id: 'track-2', meta: '1:10', title: 'Two' },
			{ id: 'track-3', meta: '1:20', title: 'Three' },
		];
		const component = driver.renderComponent(
			TrackList,
			{
				holdToReorder: false,
				onTrackReorder: (from: number, to: number) => {
					fromIndex = from;
					toIndex = to;
				},
				showDragHandles: true,
				tracks,
			},
			undefined,
		);

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const dragContainer = views.find(
			(view) => view.getAttribute('accessibilityLabel') === 'track-row-drag-track-2-1',
		);
		dragContainer?.getAttribute('onDrag')?.(
			dragEvent({ deltaX: 0, deltaY: -300, state: 2, velocityY: -800 }),
		);

		expect(fromIndex as number | null).toBe(1);
		expect(toIndex as number | null).toBe(0);
	});

	valdiIt('auto-scrolls when a row is dragged to the viewport edge', async (driver) => {
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
		const component = driver.renderComponent(
			TrackList,
			{
				dragScroller,
				holdToReorder: false,
				onTrackReorder: () => {},
				showDragHandles: true,
				tracks,
			},
			undefined,
		);

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const dragContainer = views.find(
			(view) => view.getAttribute('accessibilityLabel') === 'track-row-drag-track-1-0',
		);

		// absoluteY 96 sits inside the bottom edge zone of a 0..100 viewport
		dragContainer?.getAttribute('onDrag')?.(
			dragEvent({
				absoluteY: 96,
				deltaX: 0,
				deltaY: 40,
				state: 1,
				velocityY: 0,
			}),
		);

		expect(scrollCalls.length).toBeGreaterThan(0);
		expect(scrollCalls[0]).toBeGreaterThan(0);
		// per-tick step is capped so a long, scrolled list doesn't fling past the finger
		expect(scrollCalls[0]).toBeLessThanOrEqual(6);

		// end the drag so the auto-scroll timer is cleared
		dragContainer?.getAttribute('onDrag')?.(
			dragEvent({
				absoluteY: 96,
				deltaX: 0,
				deltaY: 40,
				state: 2,
				velocityY: 0,
			}),
		);
	});

	valdiIt(
		'suspends the ancestor scroll for the duration of an Android reorder touch',
		async (driver) => {
			const scrollEnabledCalls: Array<boolean> = [];
			const dragScroller = {
				scrollBy: () => 0,
				setScrollEnabled: (enabled: boolean) => {
					scrollEnabledCalls.push(enabled);
				},
				viewport: () => undefined,
			};
			const tracks = [
				{ id: 'track-1', meta: '1:00', title: 'One' },
				{ id: 'track-2', meta: '1:10', title: 'Two' },
			];
			const component = driver.renderComponent(
				TrackList,
				{
					dragScroller,
					holdToReorder: false,
					onTrackReorder: () => {},
					showDragHandles: true,
					tracks,
				},
				undefined,
			);
			const views = elementTypeFind(
				componentGetElements(component),
				IRenderedElementViewClass.View,
			);
			const handle = views.find(
				(view) => view.getAttribute('accessibilityLabel') === 'track-row-edit-handle-track-1-0',
			);

			// pressing the handle suspends the scroll so an up-drag moves the row instead of panning
			handle?.getAttribute('onTouch')?.(touchEventWith({ absoluteY: 50, state: 0 }));
			expect(scrollEnabledCalls).toEqual([false]);

			// lifting restores it
			handle?.getAttribute('onTouch')?.(touchEventWith({ absoluteY: 50, state: 2 }));
			expect(scrollEnabledCalls).toEqual([false, true]);
		},
	);

	valdiIt('does not auto-scroll against the drag direction', async (driver) => {
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
		const component = driver.renderComponent(
			TrackList,
			{
				dragScroller,
				holdToReorder: false,
				onTrackReorder: () => {},
				showDragHandles: true,
				tracks,
			},
			undefined,
		);
		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const dragContainer = views.find(
			(view) => view.getAttribute('accessibilityLabel') === 'track-row-drag-track-1-0',
		);

		// finger inside the bottom edge zone: the first move scrolls down
		dragContainer?.getAttribute('onDrag')?.(
			dragEvent({
				absoluteY: 95,
				deltaX: 0,
				deltaY: 40,
				state: 1,
				velocityY: 0,
			}),
		);
		const afterFirst = scrollCalls.length;
		expect(afterFirst).toBeGreaterThan(0);

		// still in the bottom zone but now moving up: must not add a downward scroll
		dragContainer?.getAttribute('onDrag')?.(
			dragEvent({
				absoluteY: 80,
				deltaX: 0,
				deltaY: 25,
				state: 1,
				velocityY: 0,
			}),
		);
		expect(scrollCalls.length).toBe(afterFirst);

		dragContainer?.getAttribute('onDrag')?.(
			dragEvent({
				absoluteY: 80,
				deltaX: 0,
				deltaY: 25,
				state: 2,
				velocityY: 0,
			}),
		);
	});

	valdiIt('reorders a row UP when dragged up under real layout', async (driver) => {
		const reordered: Array<number> = [];
		const tracks = [
			{ id: 'a', meta: '1:00', title: 'A' },
			{ id: 'b', meta: '1:10', title: 'B' },
			{ id: 'c', meta: '1:20', title: 'C' },
			{ id: 'd', meta: '1:30', title: 'D' },
		];
		const component = driver.renderComponent(
			TrackList,
			{
				holdToReorder: false,
				onTrackReorder: (from: number, to: number) => {
					reordered.push(from, to);
				},
				showDragHandles: true,
				tracks,
			},
			undefined,
		);

		await driver.performLayout({ height: 800, width: 320 });

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const findView = (label: string) =>
			views.find((view) => view.getAttribute('accessibilityLabel') === label);
		const rowHeight =
			(findView('track-row-drag-b-1')?.frame?.y ?? 0) -
			(findView('track-row-drag-a-0')?.frame?.y ?? 0);
		expect(rowHeight).toBeGreaterThan(0);

		// drag the last row up two rows and release: it must land at index 1, not go down
		const rowThree = findView('track-row-drag-d-3');
		const upDeltaY = -rowHeight * 2;
		rowThree?.getAttribute('onDrag')?.(dragEvent({ deltaX: 0, deltaY: 0, state: 0, velocityY: 0 }));
		rowThree?.getAttribute('onDrag')?.(
			dragEvent({ deltaX: 0, deltaY: upDeltaY, state: 1, velocityY: 0 }),
		);
		rowThree?.getAttribute('onDrag')?.(
			dragEvent({ deltaX: 0, deltaY: upDeltaY, state: 2, velocityY: 0 }),
		);

		expect(reordered).toEqual([3, 1]);
	});

	describe('single selection and release', () => {
		const dragHighlight = 'rgba(45,120,206,0.28)';
		const tracks = [
			{ id: 'track-1', meta: '1:00', title: 'One' },
			{ id: 'track-2', meta: '1:10', title: 'Two' },
			{ id: 'track-3', meta: '1:20', title: 'Three' },
		];

		valdiIt('highlights only one row at a time across drags', async (driver) => {
			const component = driver.renderComponent(
				TrackList,
				{
					holdToReorder: false,
					onTrackReorder: () => {},
					showDragHandles: true,
					tracks,
				},
				undefined,
			);
			const views = elementTypeFind(
				componentGetElements(component),
				IRenderedElementViewClass.View,
			);
			const findView = (label: string) =>
				views.find((view) => view.getAttribute('accessibilityLabel') === label);

			findView('track-row-drag-track-1-0')?.getAttribute('onDrag')?.(
				dragEvent({
					deltaX: 0,
					deltaY: 0,
					state: 0,
					velocityY: 0,
				}),
			);
			expect(findView('track-row-track-1-0')?.getAttribute('backgroundColor')).toBe(dragHighlight);

			findView('track-row-drag-track-2-1')?.getAttribute('onDrag')?.(
				dragEvent({
					deltaX: 0,
					deltaY: 0,
					state: 0,
					velocityY: 0,
				}),
			);

			expect(findView('track-row-track-1-0')?.getAttribute('backgroundColor')).toBe(
				theme.colors.bg,
			);
			expect(findView('track-row-track-2-1')?.getAttribute('backgroundColor')).toBe(dragHighlight);
		});

		valdiIt('ignores a late drag end for a superseded row', async (driver) => {
			const reordered: Array<number> = [];
			const component = driver.renderComponent(
				TrackList,
				{
					holdToReorder: false,
					onTrackReorder: (from: number, to: number) => {
						reordered.push(from, to);
					},
					showDragHandles: true,
					tracks,
				},
				undefined,
			);
			const views = elementTypeFind(
				componentGetElements(component),
				IRenderedElementViewClass.View,
			);
			const findView = (label: string) =>
				views.find((view) => view.getAttribute('accessibilityLabel') === label);

			findView('track-row-drag-track-1-0')?.getAttribute('onDrag')?.(
				dragEvent({
					deltaX: 0,
					deltaY: 0,
					state: 0,
					velocityY: 0,
				}),
			);
			findView('track-row-drag-track-2-1')?.getAttribute('onDrag')?.(
				dragEvent({
					deltaX: 0,
					deltaY: 0,
					state: 0,
					velocityY: 0,
				}),
			);

			// row one's drag was superseded by row two; its late end must not reorder nor
			// steal the active selection from row two
			findView('track-row-drag-track-1-0')?.getAttribute('onDrag')?.(
				dragEvent({
					deltaX: 0,
					deltaY: 70,
					state: 2,
					velocityY: 120,
				}),
			);

			expect(reordered).toEqual([]);
			expect(findView('track-row-track-2-1')?.getAttribute('backgroundColor')).toBe(dragHighlight);
		});

		valdiIt('finalises on the handle touch end and ignores the later drag end', async (driver) => {
			const reordered: Array<number> = [];
			const component = driver.renderComponent(
				TrackList,
				{
					holdToReorder: false,
					onTrackReorder: (from: number, to: number) => {
						reordered.push(from, to);
					},
					showDragHandles: true,
					tracks,
				},
				undefined,
			);
			const views = elementTypeFind(
				componentGetElements(component),
				IRenderedElementViewClass.View,
			);
			const findView = (label: string) =>
				views.find((view) => view.getAttribute('accessibilityLabel') === label);

			const dragContainer = findView('track-row-drag-track-1-0');
			dragContainer?.getAttribute('onDrag')?.(
				dragEvent({ deltaX: 0, deltaY: 0, state: 0, velocityY: 0 }),
			);
			dragContainer?.getAttribute('onDrag')?.(
				dragEvent({ deltaX: 0, deltaY: 70, state: 1, velocityY: 0 }),
			);

			// finger lifts: the handle's prompt touch end releases and commits the drag
			findView('track-row-edit-handle-track-1-0')?.getAttribute('onTouch')?.(
				touchEventWith({
					absoluteY: 80,
					state: 2,
				}),
			);
			expect(reordered).toEqual([0, 1]);
			expect(findView('track-row-track-1-0')?.getAttribute('backgroundColor')).toBe(
				theme.colors.bg,
			);

			// the laggy row drag end arrives afterwards and must be a no-op
			dragContainer?.getAttribute('onDrag')?.(
				dragEvent({ deltaX: 0, deltaY: 70, state: 2, velocityY: 90 }),
			);
			expect(reordered).toEqual([0, 1]);
		});
	});

	describe('hold to reorder', () => {
		const tracks = [
			{ id: 'track-1', meta: '1:00', title: 'One' },
			{ id: 'track-2', meta: '1:10', title: 'Two' },
			{ id: 'track-3', meta: '1:20', title: 'Three' },
		];

		valdiIt('arms with the handle long press instead of a row drag', async (driver) => {
			const component = driver.renderComponent(
				TrackList,
				{
					holdToReorder: true,
					onTrackReorder: () => {},
					showDragHandles: true,
					tracks,
				},
				undefined,
			);
			const views = elementTypeFind(
				componentGetElements(component),
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

		valdiIt('calls onTrackReorder after long press arm and touch movement', async (driver) => {
			const reordered: Array<number> = [];
			const component = driver.renderComponent(
				TrackList,
				{
					holdToReorder: true,
					onTrackReorder: (fromIndex: number, toIndex: number) => {
						reordered.push(fromIndex, toIndex);
					},
					showDragHandles: true,
					tracks,
				},
				undefined,
			);
			const views = elementTypeFind(
				componentGetElements(component),
				IRenderedElementViewClass.View,
			);
			const handle = views.find(
				(view) => view.getAttribute('accessibilityLabel') === 'track-row-edit-handle-track-1-0',
			);

			handle?.getAttribute('onLongPress')?.(touchEventWith({ absoluteY: 10, state: 0 }));
			handle?.getAttribute('onTouch')?.(touchEventWith({ absoluteY: 80, state: 1 }));
			handle?.getAttribute('onTouch')?.(touchEventWith({ absoluteY: 80, state: 2 }));

			expect(reordered).toEqual([0, 1]);
		});

		valdiIt('moves the row visually while the armed handle is touched', async (driver) => {
			const component = driver.renderComponent(
				TrackList,
				{
					holdToReorder: true,
					onTrackReorder: () => {},
					showDragHandles: true,
					tracks,
				},
				undefined,
			);
			const views = elementTypeFind(
				componentGetElements(component),
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

			handle?.getAttribute('onLongPress')?.(touchEventWith({ absoluteY: 10, state: 0 }));
			expect(row?.getAttribute('backgroundColor')).toBe('rgba(45,120,206,0.28)');
			// zIndex must stay untouched mid-gesture: Valdi applies it by re-inserting the
			// native view, which cancels the in-flight touch on iOS
			expect(row?.getAttribute('zIndex')).toBeUndefined();

			handle?.getAttribute('onTouch')?.(touchEventWith({ absoluteY: 52, state: 1 }));
			expect(dragContainer?.getAttribute('top')).toBe(42);
			expect(dragContainer?.getAttribute('bottom')).toBe(-42);
		});

		valdiIt('suspends scrolling while armed and restores it after release', async (driver) => {
			const scrollEnabledCalls: Array<boolean> = [];
			const dragScroller = {
				scrollBy: () => 0,
				setScrollEnabled: (enabled: boolean) => {
					scrollEnabledCalls.push(enabled);
				},
				viewport: () => undefined,
			};
			const component = driver.renderComponent(
				TrackList,
				{
					dragScroller,
					holdToReorder: true,
					onTrackReorder: () => {},
					showDragHandles: true,
					tracks,
				},
				undefined,
			);
			const views = elementTypeFind(
				componentGetElements(component),
				IRenderedElementViewClass.View,
			);
			const handle = views.find(
				(view) => view.getAttribute('accessibilityLabel') === 'track-row-edit-handle-track-1-0',
			);

			handle?.getAttribute('onLongPress')?.(touchEventWith({ absoluteY: 10, state: 0 }));
			expect(scrollEnabledCalls).toEqual([false]);

			handle?.getAttribute('onTouch')?.(touchEventWith({ absoluteY: 80, state: 2 }));
			expect(scrollEnabledCalls).toEqual([false, true]);
		});

		valdiIt('does not reorder when released without movement', async (driver) => {
			const reordered: Array<number> = [];
			const scrollEnabledCalls: Array<boolean> = [];
			const dragScroller = {
				scrollBy: () => 0,
				setScrollEnabled: (enabled: boolean) => {
					scrollEnabledCalls.push(enabled);
				},
				viewport: () => undefined,
			};
			const component = driver.renderComponent(
				TrackList,
				{
					dragScroller,
					holdToReorder: true,
					onTrackReorder: (fromIndex: number, toIndex: number) => {
						reordered.push(fromIndex, toIndex);
					},
					showDragHandles: true,
					tracks,
				},
				undefined,
			);
			const views = elementTypeFind(
				componentGetElements(component),
				IRenderedElementViewClass.View,
			);
			const handle = views.find(
				(view) => view.getAttribute('accessibilityLabel') === 'track-row-edit-handle-track-1-0',
			);

			handle?.getAttribute('onLongPress')?.(touchEventWith({ absoluteY: 10, state: 0 }));
			handle?.getAttribute('onTouch')?.(touchEventWith({ absoluteY: 10, state: 2 }));

			expect(reordered).toEqual([]);
			expect(scrollEnabledCalls).toEqual([false, true]);
		});

		valdiIt('ignores handle touches when not armed', async (driver) => {
			const reordered: Array<number> = [];
			const component = driver.renderComponent(
				TrackList,
				{
					holdToReorder: true,
					onTrackReorder: (fromIndex: number, toIndex: number) => {
						reordered.push(fromIndex, toIndex);
					},
					showDragHandles: true,
					tracks,
				},
				undefined,
			);
			const views = elementTypeFind(
				componentGetElements(component),
				IRenderedElementViewClass.View,
			);
			const dragContainer = views.find(
				(view) => view.getAttribute('accessibilityLabel') === 'track-row-drag-track-1-0',
			);
			const handle = views.find(
				(view) => view.getAttribute('accessibilityLabel') === 'track-row-edit-handle-track-1-0',
			);

			handle?.getAttribute('onTouch')?.(touchEventWith({ absoluteY: 10, state: 0 }));
			handle?.getAttribute('onTouch')?.(touchEventWith({ absoluteY: 80, state: 1 }));
			handle?.getAttribute('onTouch')?.(touchEventWith({ absoluteY: 80, state: 2 }));

			expect(reordered).toEqual([]);
			expect(dragContainer?.getAttribute('top')).toBeUndefined();
		});

		valdiIt('recovers when a previous drag never received its end signal', async (driver) => {
			const dragHighlight = 'rgba(45,120,206,0.28)';
			const reordered: Array<number> = [];
			const component = driver.renderComponent(
				TrackList,
				{
					holdToReorder: true,
					onTrackReorder: (fromIndex: number, toIndex: number) => {
						reordered.push(fromIndex, toIndex);
					},
					showDragHandles: true,
					tracks,
				},
				undefined,
			);
			const views = elementTypeFind(
				componentGetElements(component),
				IRenderedElementViewClass.View,
			);
			const findView = (label: string) =>
				views.find((view) => view.getAttribute('accessibilityLabel') === label);

			// arm and move row one, but its end signal never arrives (the ancestor scroll
			// cancelled the touch mid-drag), leaving it highlighted with no release
			findView('track-row-edit-handle-track-1-0')?.getAttribute('onLongPress')?.(
				touchEventWith({
					absoluteY: 10,
					state: 0,
				}),
			);
			findView('track-row-edit-handle-track-1-0')?.getAttribute('onTouch')?.(
				touchEventWith({
					absoluteY: 40,
					state: 1,
				}),
			);
			expect(findView('track-row-track-1-0')?.getAttribute('backgroundColor')).toBe(dragHighlight);

			// arming a different row must self-heal: row one releases and row two takes over,
			// rather than the leaked selection blocking every future drag
			findView('track-row-edit-handle-track-2-1')?.getAttribute('onLongPress')?.(
				touchEventWith({
					absoluteY: 10,
					state: 0,
				}),
			);
			expect(findView('track-row-track-1-0')?.getAttribute('backgroundColor')).toBe(
				theme.colors.bg,
			);
			expect(findView('track-row-track-2-1')?.getAttribute('backgroundColor')).toBe(dragHighlight);

			// and the new drag completes normally
			findView('track-row-edit-handle-track-2-1')?.getAttribute('onTouch')?.(
				touchEventWith({
					absoluteY: 90,
					state: 1,
				}),
			);
			findView('track-row-edit-handle-track-2-1')?.getAttribute('onTouch')?.(
				touchEventWith({
					absoluteY: 90,
					state: 2,
				}),
			);
			expect(reordered).toEqual([1, 2]);
		});
	});

	valdiIt('renders leading label when no artwork is provided', async (driver) => {
		const tracks = [{ id: 'a', leadingLabel: '1', meta: '1:00', title: 'Track' }];
		const component = driver.renderComponent(TrackList, { tracks }, undefined);

		const labels = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.Label,
		);
		const values = labels.map((l) => l.getAttribute('value'));
		expect(values).toContain('1');
	});

	valdiIt('updates when tracks viewModel changes', async (driver) => {
		const component = driver.renderComponent(
			TrackList,
			{ tracks: [] as Array<TrackListEntry> },
			undefined,
		);

		let labels = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.Label);
		expect(labels[0].getAttribute('value')).toBe('nothing else lined up');

		driver.renderComponent(
			TrackList,
			{ tracks: [{ id: 'x', meta: '5:00', title: 'New Track' }] },
			undefined,
		);
		labels = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.Label);
		const values = labels.map((l) => l.getAttribute('value'));
		expect(values).toContain('New Track');
	});

	valdiIt('applies palette colors to row and labels when palette is provided', async (driver) => {
		const palette = {
			accent: { hex: '#f43f5e' },
			muted_on_surface: { hex: '#d8cc99' },
			on_surface: { hex: '#ffeeaa' },
			surface: { hex: '#223344' },
		};
		const tracks = [{ id: 'a', meta: '2:15', title: 'Track Name' }];
		const component = driver.renderComponent(TrackList, { palette, tracks }, undefined);

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const row = views.find((view) => view.getAttribute('accessibilityLabel') === 'track-row-a-0');
		expect(styleAttribute(row, 'backgroundColor')).toBe('#223344');

		const labels = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.Label,
		);
		const title = labels.find((label) => label.getAttribute('value') === 'Track Name');
		const meta = labels.find((label) => label.getAttribute('value') === '2:15');
		expect(styleAttribute(title, 'color')).toBe('#ffeeaa');
		expect(styleAttribute(meta, 'color')).toBe('#d8cc99');
	});

	valdiIt('falls back to theme colors when palette is not provided', async (driver) => {
		const tracks = [{ id: 'a', meta: '2:15', title: 'Track Name' }];
		const component = driver.renderComponent(TrackList, { tracks }, undefined);

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const row = views.find((view) => view.getAttribute('accessibilityLabel') === 'track-row-a-0');
		expect(styleAttribute(row, 'backgroundColor')).toBe(theme.colors.bg);
	});
});
