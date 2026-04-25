// @ts-nocheck
import 'jasmine/src/jasmine';
import { theme } from 'atolla/src/theme';
import { TrackList } from 'atolla/src/ui/components/TrackList';
import { componentGetElements } from 'foundation/test/util/componentGetElements';
import { elementTypeFind } from 'foundation/test/util/elementTypeFind';
import { IRenderedElementViewClass } from 'valdi_test/test/IRenderedElementViewClass';
import { createComponent, valdiIt } from 'valdi_test/test/JSXTestUtils';

describe('TrackList', () => {
	valdiIt('shows empty state when no tracks are provided', () => {
		const instrumented = createComponent(TrackList, { tracks: [] });
		const component = instrumented.getComponent();

		const labels = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.Label,
		);
		expect(labels.length).toBe(1);
		expect(labels[0].getAttribute('value')).toBe('nothing else lined up');
	});

	valdiIt('renders a row for each track', () => {
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

	valdiIt('renders track title and meta labels', () => {
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

	valdiIt('uses tail ellipsis for truncated title and meta text', () => {
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

	valdiIt('calls onTrackTap with track id when row is tapped', () => {
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

	valdiIt('calls onTrackLongPress when artwork is long pressed', () => {
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
				onTrackLongPress: (pressedTrack) => {
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

			expect(longPressedTrackId).toBe('track-1');
		} finally {
			jasmine.clock().uninstall();
		}
	});

	valdiIt('calls onTrackLongPress when non-artwork region is long pressed', () => {
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
				onTrackLongPress: (pressedTrack) => {
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

			expect(longPressedTrackId).toBe('track-1');
		} finally {
			jasmine.clock().uninstall();
		}
	});

	valdiIt('keeps long press active while touch state changes', () => {
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
				onTrackLongPress: (pressedTrack) => {
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

			expect(longPressedTrackId).toBe('track-1');
		} finally {
			jasmine.clock().uninstall();
		}
	});

	valdiIt('keeps handle tap active while swipe remove is enabled', () => {
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
			onTrackLongPress: (pressedTrack) => {
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

		expect(longPressedTrackId).toBe('track-1');
		expect(removedTrackId).toBe('track-1');
		expect(removedEntryIndex).toBe(0);
	});

	valdiIt('reveals a destructive remove icon as row is swiped', () => {
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

	valdiIt('calls onTrackReorder when dragging handle vertically', () => {
		const reordered: Array<number> = [];
		const tracks = [
			{ id: 'track-1', meta: '1:00', title: 'One' },
			{ id: 'track-2', meta: '1:10', title: 'Two' },
			{ id: 'track-3', meta: '1:20', title: 'Three' },
		];
		const instrumented = createComponent(TrackList, {
			onTrackReorder: (fromIndex, toIndex) => {
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

	valdiIt('moves the row visually while dragging the reorder handle', () => {
		const tracks = [
			{ id: 'track-1', meta: '1:00', title: 'One' },
			{ id: 'track-2', meta: '1:10', title: 'Two' },
		];
		const instrumented = createComponent(TrackList, {
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

	valdiIt('clamps handle drag reorder to list boundaries', () => {
		let fromIndex: number | null = null;
		let toIndex: number | null = null;
		const tracks = [
			{ id: 'track-1', meta: '1:00', title: 'One' },
			{ id: 'track-2', meta: '1:10', title: 'Two' },
			{ id: 'track-3', meta: '1:20', title: 'Three' },
		];
		const instrumented = createComponent(TrackList, {
			onTrackReorder: (from, to) => {
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

		expect(fromIndex).toBe(1);
		expect(toIndex).toBe(0);
	});

	valdiIt('renders leading label when no artwork is provided', () => {
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

	valdiIt('updates when tracks viewModel changes', () => {
		const instrumented = createComponent(TrackList, { tracks: [] });
		const component = instrumented.getComponent();

		let labels = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.Label);
		expect(labels[0].getAttribute('value')).toBe('nothing else lined up');

		instrumented.setViewModel({ tracks: [{ id: 'x', meta: '5:00', title: 'New Track' }] });
		labels = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.Label);
		const values = labels.map((l) => l.getAttribute('value'));
		expect(values).toContain('New Track');
	});

	valdiIt('applies palette colors to row and labels when palette is provided', () => {
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

	valdiIt('falls back to theme colors when palette is not provided', () => {
		const tracks = [{ id: 'a', meta: '2:15', title: 'Track Name' }];
		const instrumented = createComponent(TrackList, { tracks });
		const component = instrumented.getComponent();

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const row = views.find((view) => view.getAttribute('accessibilityLabel') === 'track-row-a-0');
		expect(row?.getAttribute('style').attributes.backgroundColor).toBe(theme.colors.bg);
	});
});
