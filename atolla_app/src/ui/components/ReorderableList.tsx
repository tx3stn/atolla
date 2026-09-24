import { AnimationCurve } from 'valdi_core/src/AnimationOptions';
import { Component } from 'valdi_core/src/Component';
import { Device } from 'valdi_core/src/Device';
import { ElementRef } from 'valdi_core/src/ElementRef';
import { Style } from 'valdi_core/src/Style';
import { RenderedElementUtils } from 'valdi_core/src/utils/RenderedElementUtils';
import type { DragEvent, TouchEvent } from 'valdi_tsx/src/GestureEvents';
import type { Layout, View } from 'valdi_tsx/src/NativeTemplateElements';
import { DragReorderEngine } from './DragReorderEngine';
import type { RowSlot } from './listReorder';
import { ReorderGestures } from './ReorderGestures';
import type { DragAutoScroller } from './ScrollDragAutoScroller';

export interface ReorderableRowHandle {
	longPressDuration: number;
	onLongPress: ((event: TouchEvent) => void) | undefined;
	onLongPressDisabled: boolean;
	onTouch: (event: TouchEvent) => void;
	ref: ElementRef;
}

export interface ReorderableListViewModel {
	dragScroller?: DragAutoScroller;
	// arm reordering with a long-press on the handle and track movement via onTouch, instead of
	// an onDrag on the row. defaults true on iOS, where the ancestor scroll's pan otherwise races
	// (and cancels) the row's drag recogniser
	holdToReorder?: boolean;
	ids: Array<string>;
	onReorder: (fromIndex: number, toIndex: number) => void;
	renderRow: (index: number, handle: ReorderableRowHandle) => void;
	rowIdentityPrefix?: string;
}

// the ancestor scroll delays delivering touches on iOS, so the recogniser's timer starts late;
// with the delay the effective hold is ~250ms (platform-standard)
const HANDLE_LONG_PRESS_SECONDS = 0.1;
const DRAG_OPACITY = 0.86;
const DRAG_RELEASE_SECONDS = 0.14;
const ROW_SLOT_HEIGHT = 112;

export class ReorderableList extends Component<ReorderableListViewModel> {
	private handleByIdentity = new Map<string, ReorderableRowHandle>();
	private rowIdentitiesByIndex: Array<string> = [];
	private rowRefByIdentity = new Map<string, ElementRef>();
	private engine = new DragReorderEngine({
		dragScroller: () => this.viewModel.dragScroller,
		identities: () => this.rowIdentitiesByIndex,
		isDestroyed: () => this.isDestroyed(),
		measureSlots: () => this.buildDragSlots(),
		rowViewportCentre: (identity) => this.rowViewportCentre(identity),
		setRowOffset: (identity, offset, durationSeconds) => {
			if (durationSeconds === undefined) {
				this.setRowVerticalOffset(identity, offset);
				return;
			}
			this.animate(
				{ beginFromCurrentState: true, curve: AnimationCurve.EaseOut, duration: durationSeconds },
				() => {
					this.setRowVerticalOffset(identity, offset);
				},
			);
		},
	});
	private gestures = new ReorderGestures(
		{
			canReorder: () => true,
			dragScroller: () => this.viewModel.dragScroller,
			hasRow: (identity) => this.rowRefByIdentity.has(identity),
			holdToReorder: () => this.holdToReorder,
			onArmed: () => {},
			onDropped: () => {},
			onReorder: (fromIndex, toIndex) => this.viewModel.onReorder(fromIndex, toIndex),
			setRowAppearance: (identity, isDragging) => this.setRowAppearance(identity, isDragging),
			setRowVerticalOffset: (identity, offset) => this.setRowVerticalOffset(identity, offset),
		},
		this.engine,
	);

	private get holdToReorder(): boolean {
		return this.viewModel.holdToReorder ?? Device.isIOS();
	}

	onDestroy(): void {
		this.gestures.stop();
		this.handleByIdentity.clear();
		this.rowRefByIdentity.clear();
		this.rowIdentitiesByIndex.length = 0;
	}

	onRender(): void {
		if (this.gestures.draggingCount === 0) {
			for (const ref of this.rowRefByIdentity.values()) {
				ref.setAttribute('top', 0);
				ref.setAttribute('bottom', 0);
			}
		}

		this.rowIdentitiesByIndex.length = this.viewModel.ids.length;
		const dragToReorder = !this.holdToReorder;

		<layout style={styles.list}>
			{this.viewModel.ids.map((id: string, index: number) => {
				const identity = this.rowIdentityFor(id, index);
				this.rowIdentitiesByIndex[index] = identity;

				return (
					<view
						accessibilityId={`reorderable-row-${identity}`}
						accessibilityLabel={`reorderable-row-${identity}`}
						key={identity}
						onDrag={
							dragToReorder
								? ((entryIndex, rowIdentity) => (event: DragEvent) => {
										this.gestures.drag(event, entryIndex, rowIdentity);
									})(index, identity)
								: undefined
						}
						onDragDisabled={!dragToReorder}
						onDragPredicate={
							dragToReorder
								? (
										(rowIdentity) => (event: DragEvent) =>
											((this.gestures.pressedIdentity === rowIdentity &&
												this.gestures.draggingCount === 0) ||
												this.gestures.isDragging(rowIdentity)) &&
											Math.abs(event.deltaY) > Math.abs(event.deltaX)
									)(identity)
								: undefined
						}
						ref={this.getRowRef(identity)}
						style={styles.row}
					>
						{this.viewModel.renderRow(index, this.handleFor(index, identity))}
					</view>
				);
			})}
		</layout>;
	}

	private buildDragSlots(): Array<RowSlot> {
		const count = this.viewModel.ids.length;
		const measured: Array<RowSlot> = [];
		for (let i = 0; i < count; i++) {
			const identity = this.rowIdentitiesByIndex[i];
			const frame = identity ? this.rowRefByIdentity.get(identity)?.all()?.[0]?.frame : undefined;
			if (!frame?.height) break;
			measured.push({ height: frame.height, top: frame.y });
		}

		if (measured.length === count) {
			return measured;
		}

		const slots: Array<RowSlot> = [];
		for (let i = 0; i < count; i++) {
			slots.push({ height: ROW_SLOT_HEIGHT, top: i * ROW_SLOT_HEIGHT });
		}
		return slots;
	}

	private getRowRef(identity: string): ElementRef {
		const existing = this.rowRefByIdentity.get(identity);
		if (existing) {
			return existing;
		}
		const created = new ElementRef();
		this.rowRefByIdentity.set(identity, created);
		return created;
	}

	private handleFor(entryIndex: number, identity: string): ReorderableRowHandle {
		const existing = this.handleByIdentity.get(identity);
		if (existing) {
			return existing;
		}

		const created: ReorderableRowHandle = {
			longPressDuration: HANDLE_LONG_PRESS_SECONDS,
			onLongPress: this.holdToReorder
				? (event: TouchEvent) => {
						this.gestures.arm(event, entryIndex, identity);
					}
				: undefined,
			onLongPressDisabled: !this.holdToReorder,
			onTouch: (event: TouchEvent) => {
				this.gestures.touch(event, entryIndex, identity);
			},
			ref: new ElementRef(),
		};
		this.handleByIdentity.set(identity, created);
		return created;
	}

	private rowIdentityFor(id: string, index: number): string {
		return `${this.viewModel.rowIdentityPrefix ?? ''}${id}-${index}`;
	}

	// the dragged row's live centre in the same space the scroller reports its viewport in.
	// gesture coordinates can't be used here: Android delivers them in device pixels while
	// element frames are in points, and the two are only reconcilable via a display scale the
	// bridge doesn't always provide
	private rowViewportCentre(identity: string): number | undefined {
		const element = this.rowRefByIdentity.get(identity)?.all()?.[0];
		if (!element?.frame?.height) {
			return undefined;
		}
		return RenderedElementUtils.absolutePosition(element).y + element.frame.height / 2;
	}

	// Valdi applies zIndex by removing and re-inserting the native view, which on iOS cancels
	// every in-flight touch in the subtree — including the gesture driving the drag. opacity
	// lifts the row without touching z-order
	private setRowAppearance(identity: string, isDragging: boolean): void {
		const ref = this.rowRefByIdentity.get(identity);
		if (!ref) {
			return;
		}
		if (isDragging) {
			ref.setAttribute('opacity', DRAG_OPACITY);
			return;
		}
		this.animate(
			{
				beginFromCurrentState: true,
				curve: AnimationCurve.EaseOut,
				duration: DRAG_RELEASE_SECONDS,
			},
			() => {
				ref.setAttribute('opacity', 1);
			},
		);
	}

	private setRowVerticalOffset(identity: string, offset: number): void {
		const ref = this.rowRefByIdentity.get(identity);
		if (!ref) {
			return;
		}
		ref.setAttribute('top', offset);
		ref.setAttribute('bottom', -offset);
	}
}

const styles = {
	list: new Style<Layout>({
		width: '100%',
	}),
	row: new Style<View>({
		overflow: 'visible',
		position: 'relative',
		width: '100%',
	}),
};
