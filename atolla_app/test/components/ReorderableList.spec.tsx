import 'jasmine/src/jasmine';
import {
	ReorderableList,
	type ReorderableRowHandle,
} from 'atolla_app/src/ui/components/ReorderableList';
import type { DragAutoScroller } from 'atolla_app/src/ui/components/ScrollDragAutoScroller';
import { componentGetElements } from 'foundation/test/util/componentGetElements';
import { elementTypeFind } from 'foundation/test/util/elementTypeFind';
import type { IRenderedElement } from 'valdi_core/src/IRenderedElement';
import { Style } from 'valdi_core/src/Style';
import { IRenderedElementViewClass } from 'valdi_test/test/IRenderedElementViewClass';
import type { IComponentTestDriver } from 'valdi_test/test/JSXTestUtils';
import { valdiIt } from 'valdi_test/test/JSXTestUtils';
import type { View } from 'valdi_tsx/src/NativeTemplateElements';
import { dragEvent, touchEventWith } from '../util/testEvents';

const ROW_HEIGHT = 100;

describe('ReorderableList', () => {
	valdiIt('renders a row for every id it is given', async (driver) => {
		const component = render(driver, ['a', 'b', 'c'], () => {});

		expect(accessibilityIds(component)).toContain('row-content-0');
		expect(accessibilityIds(component)).toContain('row-content-2');
		expect(accessibilityIds(component)).not.toContain('row-content-3');
	});

	valdiIt('reports a drop computed from real measured row frames', async (driver) => {
		const reordered: Array<number> = [];
		const component = render(driver, ['a', 'b', 'c', 'd'], (from, to) => {
			reordered.push(from, to);
		});
		await driver.performLayout({ height: 800, width: 320 });

		const rowHeight = measuredRowHeight(component);
		const row = elementById(component, 'reorderable-row-a-0');
		row?.getAttribute('onDrag')?.(dragEvent({ deltaX: 0, deltaY: 0, state: 0, velocityY: 0 }));
		row?.getAttribute('onDrag')?.(
			dragEvent({ deltaX: 0, deltaY: rowHeight * 2, state: 1, velocityY: 0 }),
		);
		row?.getAttribute('onDrag')?.(
			dragEvent({ deltaX: 0, deltaY: rowHeight * 2, state: 2, velocityY: 90 }),
		);

		expect(reordered).toEqual([0, 2]);
	});

	valdiIt('reports a hold-to-reorder drop from the handle touch stream', async (driver) => {
		const reordered: Array<number> = [];
		const component = render(
			driver,
			['a', 'b', 'c', 'd'],
			(from, to) => {
				reordered.push(from, to);
			},
			{ holdToReorder: true },
		);
		await driver.performLayout({ height: 800, width: 320 });

		const rowHeight = measuredRowHeight(component);
		const handle = elementById(component, 'row-handle-0');
		const originY = 200;
		handle?.getAttribute('onLongPress')?.(touchEventWith({ absoluteY: originY, state: 0 }));
		handle?.getAttribute('onTouch')?.(
			touchEventWith({ absoluteY: originY + rowHeight * 2, state: 1 }),
		);
		handle?.getAttribute('onTouch')?.(
			touchEventWith({ absoluteY: originY + rowHeight * 2, state: 2 }),
		);

		expect(reordered).toEqual([0, 2]);
	});

	valdiIt('reports an upward drop', async (driver) => {
		const reordered: Array<number> = [];
		const component = render(driver, ['a', 'b', 'c'], (from, to) => {
			reordered.push(from, to);
		});
		await driver.performLayout({ height: 800, width: 320 });

		const rowHeight = measuredRowHeight(component);
		dragRow(component, 'reorderable-row-c-2', -rowHeight * 2);

		expect(reordered).toEqual([2, 0]);
	});

	valdiIt('clamps a drop to the end of the list', async (driver) => {
		const reordered: Array<number> = [];
		const component = render(driver, ['a', 'b', 'c'], (from, to) => {
			reordered.push(from, to);
		});
		await driver.performLayout({ height: 800, width: 320 });

		dragRow(component, 'reorderable-row-a-0', measuredRowHeight(component) * 20);

		expect(reordered).toEqual([0, 2]);
	});

	valdiIt('reports nothing when a row is released where it started', async (driver) => {
		const reordered: Array<number> = [];
		const component = render(driver, ['a', 'b', 'c'], (from, to) => {
			reordered.push(from, to);
		});
		await driver.performLayout({ height: 800, width: 320 });

		dragRow(component, 'reorderable-row-a-0', 0);

		expect(reordered).toEqual([]);
	});

	valdiIt('moves the row while the drag is in flight', async (driver) => {
		const component = render(driver, ['a', 'b'], () => {});
		await driver.performLayout({ height: 800, width: 320 });

		const row = elementById(component, 'reorderable-row-a-0');
		row?.getAttribute('onDrag')?.(dragEvent({ deltaX: 0, deltaY: 0, state: 0, velocityY: 0 }));
		row?.getAttribute('onDrag')?.(dragEvent({ deltaX: 0, deltaY: 40, state: 1, velocityY: 0 }));

		expect(row?.getAttribute('top')).toBe(40);
		expect(row?.getAttribute('bottom')).toBe(-40);
	});

	valdiIt('suspends the scroll while armed and restores it after release', async (driver) => {
		const enabled: Array<boolean> = [];
		const component = render(driver, ['a', 'b'], () => {}, {
			dragScroller: fakeScroller((value) => enabled.push(value)),
		});

		const handle = elementById(component, 'row-handle-0');
		handle?.getAttribute('onTouch')?.(touchEventWith({ absoluteY: 100, state: 0 }));
		handle?.getAttribute('onTouch')?.(touchEventWith({ absoluteY: 100, state: 2 }));

		expect(enabled).toEqual([false, true]);
	});

	valdiIt('finalises on the handle touch end and ignores the later drag end', async (driver) => {
		const reordered: Array<number> = [];
		const component = render(driver, ['a', 'b', 'c'], (from, to) => {
			reordered.push(from, to);
		});
		await driver.performLayout({ height: 800, width: 320 });

		const deltaY = measuredRowHeight(component) * 2;
		const row = elementById(component, 'reorderable-row-a-0');
		const handle = elementById(component, 'row-handle-0');
		handle?.getAttribute('onTouch')?.(touchEventWith({ absoluteY: 100, state: 0 }));
		row?.getAttribute('onDrag')?.(dragEvent({ deltaX: 0, deltaY: 0, state: 0, velocityY: 0 }));
		row?.getAttribute('onDrag')?.(dragEvent({ deltaX: 0, deltaY, state: 1, velocityY: 0 }));
		handle?.getAttribute('onTouch')?.(touchEventWith({ absoluteY: 100 + deltaY, state: 2 }));
		row?.getAttribute('onDrag')?.(dragEvent({ deltaX: 0, deltaY, state: 2, velocityY: 0 }));

		expect(reordered).toEqual([0, 2]);
	});

	valdiIt('ignores a late drag end for a row a newer drag superseded', async (driver) => {
		const reordered: Array<number> = [];
		const component = render(driver, ['a', 'b', 'c'], (from, to) => {
			reordered.push(from, to);
		});
		await driver.performLayout({ height: 800, width: 320 });

		const rowHeight = measuredRowHeight(component);
		const first = elementById(component, 'reorderable-row-a-0');
		const second = elementById(component, 'reorderable-row-b-1');
		first?.getAttribute('onDrag')?.(dragEvent({ deltaX: 0, deltaY: 0, state: 0, velocityY: 0 }));
		second?.getAttribute('onDrag')?.(dragEvent({ deltaX: 0, deltaY: 0, state: 0, velocityY: 0 }));
		first?.getAttribute('onDrag')?.(
			dragEvent({ deltaX: 0, deltaY: rowHeight * 2, state: 2, velocityY: 0 }),
		);

		expect(reordered).toEqual([]);
	});

	valdiIt('gives every row its own handle', async (driver) => {
		const handles: Array<ReorderableRowHandle> = [];
		const component = render(driver, ['a', 'b'], () => {}, { collect: handles });

		expect(accessibilityIds(component)).toContain('row-handle-0');
		expect(accessibilityIds(component)).toContain('row-handle-1');
		expect(handles[0]).not.toBe(handles[1]);
	});
});

type RenderedComponent = Parameters<typeof componentGetElements>[0];

interface RenderOptions {
	collect?: Array<ReorderableRowHandle>;
	dragScroller?: DragAutoScroller;
	holdToReorder?: boolean;
}

function accessibilityIds(component: RenderedComponent): Array<string> {
	return elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View)
		.map((view) => view.getAttribute('accessibilityId'))
		.filter((id): id is string => typeof id === 'string');
}

function dragRow(component: RenderedComponent, label: string, deltaY: number): void {
	const row = elementById(component, label);
	row?.getAttribute('onDrag')?.(dragEvent({ deltaX: 0, deltaY: 0, state: 0, velocityY: 0 }));
	row?.getAttribute('onDrag')?.(dragEvent({ deltaX: 0, deltaY, state: 1, velocityY: 0 }));
	row?.getAttribute('onDrag')?.(dragEvent({ deltaX: 0, deltaY, state: 2, velocityY: 0 }));
}

function elementById(component: RenderedComponent, id: string): IRenderedElement | undefined {
	return elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View).find(
		(element) => element.getAttribute('accessibilityId') === id,
	);
}

function fakeScroller(onSetScrollEnabled: (enabled: boolean) => void): DragAutoScroller {
	return {
		scrollBy: () => 0,
		setScrollEnabled: onSetScrollEnabled,
		viewport: () => undefined,
	};
}

function measuredRowHeight(component: RenderedComponent): number {
	const first = elementById(component, 'reorderable-row-a-0')?.frame?.y ?? 0;
	const second = elementById(component, 'reorderable-row-b-1')?.frame?.y ?? 0;
	expect(second - first).toBeGreaterThan(0);
	return second - first;
}

function render(
	driver: IComponentTestDriver,
	ids: Array<string>,
	onReorder: (fromIndex: number, toIndex: number) => void,
	options: RenderOptions = {},
) {
	return driver.renderComponent(
		ReorderableList,
		{
			dragScroller: options.dragScroller,
			holdToReorder: options.holdToReorder ?? false,
			ids,
			onReorder,
			renderRow: (index: number, handle: ReorderableRowHandle) => {
				options.collect?.push(handle);
				<view
					accessibilityId={`row-content-${index}`}
					accessibilityLabel={`row-content-${index}`}
					style={styles.content}
				>
					<view
						accessibilityId={`row-handle-${index}`}
						accessibilityLabel={`row-handle-${index}`}
						longPressDuration={handle.longPressDuration}
						onLongPress={handle.onLongPress}
						onLongPressDisabled={handle.onLongPressDisabled}
						onTouch={handle.onTouch}
						ref={handle.ref}
						style={styles.handle}
					/>
				</view>;
			},
		},
		undefined,
	);
}

const styles = {
	content: new Style<View>({
		height: ROW_HEIGHT,
		width: '100%',
	}),
	handle: new Style<View>({
		height: 24,
		width: 24,
	}),
};
