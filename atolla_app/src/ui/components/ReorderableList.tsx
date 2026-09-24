import { AnimationCurve } from 'valdi_core/src/AnimationOptions';
import { Component } from 'valdi_core/src/Component';
import { Device } from 'valdi_core/src/Device';
import { ElementRef } from 'valdi_core/src/ElementRef';
import { Style } from 'valdi_core/src/Style';
import { RenderedElementUtils } from 'valdi_core/src/utils/RenderedElementUtils';
import type { DragEvent, TouchEvent } from 'valdi_tsx/src/GestureEvents';
import type { Layout, View } from 'valdi_tsx/src/NativeTemplateElements';
import { hapticFeedback } from '../../utils/Haptics';
import { DragReorderEngine } from './DragReorderEngine';
import type { RowSlot } from './listReorder';
import type { DragAutoScroller } from './ScrollDragAutoScroller';
import { TouchEventState } from './TouchEventState';

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
	private armedDragOriginY = 0;
	// the row whose drag was already finalised, so the second of its two end signals
	// (the prompt handle onTouch and the laggy row onDrag) is a no-op
	private dragEndedIdentity: string | null = null;
	private draggingIdentities = new Set<string>();
	private handleBeingPressedIdentity: string | null = null;
	private handleByIdentity = new Map<string, ReorderableRowHandle>();
	private rowIdentitiesByIndex: Array<string> = [];
	private rowRefByIdentity = new Map<string, ElementRef>();
	private reorder = new DragReorderEngine({
		dragScroller: () => this.viewModel.dragScroller,
		identities: () => this.rowIdentitiesByIndex,
		isDestroyed: () => this.isDestroyed(),
		measureSlots: () => this.buildDragSlots(),
		rowViewportCentre: (identity) => this.rowViewportCentre(identity),
		setRowOffset: (identity, offset, durationSeconds) => {
			if (durationSeconds === undefined) {
				this.setRowOffset(identity, offset);
				return;
			}
			this.animate(
				{ beginFromCurrentState: true, curve: AnimationCurve.EaseOut, duration: durationSeconds },
				() => {
					this.setRowOffset(identity, offset);
				},
			);
		},
	});

	private get holdToReorder(): boolean {
		return this.viewModel.holdToReorder ?? Device.isIOS();
	}

	onDestroy(): void {
		this.reorder.stopAutoScroll();
		this.resetDragState();
		this.draggingIdentities.clear();
		this.handleByIdentity.clear();
		this.rowRefByIdentity.clear();
		this.rowIdentitiesByIndex.length = 0;
	}

	onRender(): void {
		if (this.draggingIdentities.size === 0) {
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
										this.handleDrag(event, entryIndex, rowIdentity);
									})(index, identity)
								: undefined
						}
						onDragDisabled={!dragToReorder}
						onDragPredicate={
							dragToReorder
								? (
										(rowIdentity) => (event: DragEvent) =>
											((this.handleBeingPressedIdentity === rowIdentity &&
												this.draggingIdentities.size === 0) ||
												this.draggingIdentities.has(rowIdentity)) &&
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

	// hold-to-reorder arm: the native long-press recogniser staying active is what stops the
	// ancestor scroll's pan from starting for the rest of this touch; disabling the scroll is
	// belt-and-braces on top of that
	private armReorder(event: TouchEvent, entryIndex: number, identity: string): void {
		if (this.reorder.identity === identity) {
			return;
		}
		// a fresh long-press is a brand new single-touch sequence, so any drag state still around
		// belongs to a previous gesture whose end signal was dropped (e.g. the ancestor scroll
		// cancelled the touch mid-drag). tear it down so a leaked selection can never block this
		// or any future drag
		if (this.reorder.identity !== null || this.draggingIdentities.size > 0) {
			this.releaseLingeringDrag();
		}
		this.beginDrag(entryIndex, identity);
		this.armedDragOriginY = event.absoluteY;
		hapticFeedback();
		this.viewModel.dragScroller?.setScrollEnabled(false);
	}

	private beginDrag(entryIndex: number, identity: string): void {
		this.setRowDraggingAppearance(identity, true);
		this.reorder.begin(entryIndex, identity);
		this.dragEndedIdentity = null;
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

	private cancelDrag(identity: string): void {
		this.setRowOffset(identity, 0);
		this.reorder.settleNeighbours(identity);
		this.setRowDraggingAppearance(identity, false);
		this.resetDragState();
	}

	private finalizeDrag(entryIndex: number, identity: string, deltaY: number): void {
		const drop = this.reorder.resolveDrop(entryIndex, deltaY);
		if (!drop) {
			this.cancelDrag(identity);
			return;
		}

		// snap the dragged row to its final slot; leave neighbours shifted, the re-render from
		// onReorder replaces this state without a flash
		this.setRowOffset(identity, drop.snapOffset);
		this.setRowDraggingAppearance(identity, false);
		// clear stale offset tracking so future drags don't skip animations for elements that
		// happen to share an identity with a previous neighbour
		this.reorder.clearNeighbourTracking();
		this.resetDragState();
		this.viewModel.onReorder(entryIndex, drop.targetIndex);
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

	private handleDrag(event: DragEvent, entryIndex: number, identity: string): void {
		if (event.state === TouchEventState.Started) {
			this.beginDrag(entryIndex, identity);
			return;
		}

		if (event.state === TouchEventState.Changed) {
			if (this.reorder.fromIndex !== entryIndex) {
				this.beginDrag(entryIndex, identity);
			}
			this.reorder.move(event.deltaY);
			return;
		}

		// this drag already finished through its other end signal (the prompt handle onTouch or
		// the laggy row onDrag); ignore the duplicate so we don't reorder twice
		if (this.dragEndedIdentity === identity) {
			return;
		}

		// a late end event for a row superseded by a newer drag must only release its own
		// highlight, never reset the active drag's state underneath it
		if (this.reorder.identity !== null && this.reorder.identity !== identity) {
			this.releaseRowAppearance(identity);
			return;
		}

		this.reorder.stopAutoScroll();
		this.dragEndedIdentity = identity;

		if (event.state !== TouchEventState.Ended) {
			this.cancelDrag(identity);
			return;
		}

		this.finalizeDrag(entryIndex, identity, event.deltaY);
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
						this.armReorder(event, entryIndex, identity);
					}
				: undefined,
			onLongPressDisabled: !this.holdToReorder,
			onTouch: (event: TouchEvent) => {
				this.handleTouch(event, entryIndex, identity);
			},
			ref: new ElementRef(),
		};
		this.handleByIdentity.set(identity, created);
		return created;
	}

	private handleTouch(event: TouchEvent, entryIndex: number, identity: string): void {
		const isEnd =
			event.state !== TouchEventState.Started && event.state !== TouchEventState.Changed;

		if (event.state === TouchEventState.Started) {
			this.handleBeingPressedIdentity = identity;
			// Android drives the reorder through the row's onDrag while the ancestor scroll stays
			// live, so an upward drag pans the list instead of moving the row; suspend the scroll
			// for the whole handle touch (iOS does this via armReorder's long-press instead)
			if (!this.holdToReorder) {
				this.viewModel.dragScroller?.setScrollEnabled(false);
			}
		} else if (isEnd) {
			if (this.handleBeingPressedIdentity === identity) {
				this.handleBeingPressedIdentity = null;
			}
			if (!this.holdToReorder) {
				this.viewModel.dragScroller?.setScrollEnabled(true);
			}
		}

		if (!this.holdToReorder) {
			// Android drives the movement through the row's onDrag, but that recogniser's end event
			// arrives late. the handle's touch stream ends promptly on finger lift, so finalise here
			// too and let whichever end fires first win; the dragEndedIdentity latch makes the
			// slower one a no-op
			if (isEnd && this.reorder.identity === identity && this.dragEndedIdentity !== identity) {
				this.reorder.stopAutoScroll();
				this.dragEndedIdentity = identity;
				this.finalizeDrag(entryIndex, identity, this.reorder.lastDeltaY);
			}
			return;
		}

		// iOS hold-to-reorder: the touch stream drives the drag itself (it keeps delivering even
		// while the long-press recogniser is active, unlike onDrag)
		if (this.reorder.identity !== identity || event.state === TouchEventState.Started) {
			return;
		}

		this.handleDrag(
			{
				...event,
				deltaX: 0,
				deltaY: event.absoluteY - this.armedDragOriginY,
				velocityX: 0,
				velocityY: 0,
			} as DragEvent,
			entryIndex,
			identity,
		);
	}

	private releaseLingeringDrag(): void {
		if (this.reorder.identity) {
			this.setRowOffset(this.reorder.identity, 0);
		}
		this.reorder.settleNeighbours(this.reorder.identity ?? '');
		for (const identity of [...this.draggingIdentities]) {
			this.releaseRowAppearance(identity);
		}
		this.reorder.clearNeighbourTracking();
		this.resetDragState();
	}

	private releaseRowAppearance(identity: string): void {
		this.draggingIdentities.delete(identity);
		if (this.handleBeingPressedIdentity === identity) {
			this.handleBeingPressedIdentity = null;
		}

		const ref = this.rowRefByIdentity.get(identity);
		if (!ref) {
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

	private resetDragState(): void {
		this.armedDragOriginY = 0;
		this.reorder.reset();
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
	private setRowDraggingAppearance(identity: string, isDragging: boolean): void {
		if (!isDragging) {
			this.releaseRowAppearance(identity);
			return;
		}

		const ref = this.rowRefByIdentity.get(identity);
		if (!ref) {
			return;
		}

		// only one row may be selected at a time: releasing any other highlighted row here means
		// a fresh drag can never inherit a previous, slow-releasing selection
		for (const other of this.draggingIdentities) {
			if (other !== identity) {
				this.releaseRowAppearance(other);
			}
		}

		this.draggingIdentities.add(identity);
		ref.setAttribute('opacity', DRAG_OPACITY);
	}

	private setRowOffset(identity: string, offset: number): void {
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
