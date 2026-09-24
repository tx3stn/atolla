import type { DragEvent, TouchEvent } from 'valdi_tsx/src/GestureEvents';
import { hapticFeedback } from '../../utils/Haptics';
import type { DragReorderEngine } from './DragReorderEngine';
import type { DragAutoScroller } from './ScrollDragAutoScroller';
import { TouchEventState } from './TouchEventState';

export interface ReorderGesturesHost {
	canReorder(): boolean;
	dragScroller(): DragAutoScroller | undefined;
	hasRow(identity: string): boolean;
	holdToReorder(): boolean;
	onArmed(): void;
	onDropped(identity: string): void;
	onReorder(fromIndex: number, toIndex: number): void;
	setRowAppearance(identity: string, isDragging: boolean): void;
	setRowVerticalOffset(identity: string, offset: number): void;
}

export class ReorderGestures {
	private armedDragOriginY = 0;
	// the row whose drag was already finalised, so the second of its two end signals
	// (the prompt handle onTouch and the laggy row onDrag) is a no-op
	private dragEndedIdentity: string | null = null;
	private draggingIdentities = new Set<string>();
	private pressed: string | null = null;

	constructor(
		private readonly host: ReorderGesturesHost,
		private readonly engine: DragReorderEngine,
	) {}

	get draggingCount(): number {
		return this.draggingIdentities.size;
	}

	get pressedIdentity(): string | null {
		return this.pressed;
	}

	// hold-to-reorder arm: the native long-press recogniser staying active is what stops the
	// ancestor scroll's pan from starting for the rest of this touch; disabling the scroll is
	// belt-and-braces on top of that
	arm(event: TouchEvent, entryIndex: number, identity: string): void {
		if (!this.host.canReorder() || this.engine.identity === identity) {
			return;
		}
		// a fresh long-press is a brand new single-touch sequence, so any drag state still around
		// belongs to a previous gesture whose end signal was dropped (e.g. the ancestor scroll
		// cancelled the touch mid-drag). tear it down so a leaked selection can never block this
		// or any future drag
		if (this.engine.identity !== null || this.draggingIdentities.size > 0) {
			this.releaseLingering();
		}
		this.host.onArmed();
		this.begin(entryIndex, identity);
		this.armedDragOriginY = event.absoluteY;
		hapticFeedback();
		this.host.dragScroller()?.setScrollEnabled(false);
	}

	drag(event: DragEvent, entryIndex: number, identity: string): void {
		if (!this.host.canReorder()) {
			return;
		}

		if (event.state === TouchEventState.Started) {
			this.begin(entryIndex, identity);
			return;
		}

		if (event.state === TouchEventState.Changed) {
			if (this.engine.fromIndex !== entryIndex) {
				this.begin(entryIndex, identity);
			}
			this.engine.move(event.deltaY);
			return;
		}

		// this drag already finished through its other end signal (the prompt handle onTouch or
		// the laggy row onDrag); ignore the duplicate so we don't reorder twice
		if (this.dragEndedIdentity === identity) {
			return;
		}

		// a late end event for a row superseded by a newer drag must only release its own
		// highlight, never reset the active drag's state underneath it
		if (this.engine.identity !== null && this.engine.identity !== identity) {
			this.release(identity);
			return;
		}

		this.engine.stopAutoScroll();
		this.dragEndedIdentity = identity;

		if (event.state !== TouchEventState.Ended) {
			this.cancel(identity);
			return;
		}

		this.finalize(entryIndex, identity, event.deltaY);
	}

	isDragging(identity: string): boolean {
		return this.draggingIdentities.has(identity);
	}

	release(identity: string): void {
		this.draggingIdentities.delete(identity);
		if (this.pressed === identity) {
			this.pressed = null;
		}
		this.host.setRowAppearance(identity, false);
	}

	reset(): void {
		this.armedDragOriginY = 0;
		this.engine.reset();
	}

	stop(): void {
		this.engine.stopAutoScroll();
		this.reset();
		this.draggingIdentities.clear();
		this.pressed = null;
	}

	touch(event: TouchEvent, entryIndex: number, identity: string): void {
		const isEnd =
			event.state !== TouchEventState.Started && event.state !== TouchEventState.Changed;

		if (event.state === TouchEventState.Started) {
			this.pressed = identity;
			// Android drives the reorder through the row's onDrag while the ancestor scroll stays
			// live, so an upward drag pans the list instead of moving the row; suspend the scroll
			// for the whole handle touch (iOS does this via arm's long-press instead)
			if (!this.host.holdToReorder()) {
				this.host.dragScroller()?.setScrollEnabled(false);
			}
		} else if (isEnd) {
			if (this.pressed === identity) {
				this.pressed = null;
			}
			if (!this.host.holdToReorder()) {
				this.host.dragScroller()?.setScrollEnabled(true);
			}
		}

		if (!this.host.holdToReorder()) {
			// Android drives the movement through the row's onDrag, but that recogniser's end event
			// arrives late. the handle's touch stream ends promptly on finger lift, so finalise here
			// too and let whichever end fires first win; the dragEndedIdentity latch makes the
			// slower one a no-op
			if (isEnd && this.engine.identity === identity && this.dragEndedIdentity !== identity) {
				this.engine.stopAutoScroll();
				this.dragEndedIdentity = identity;
				this.finalize(entryIndex, identity, this.engine.lastDeltaY);
			}
			return;
		}

		// iOS hold-to-reorder: the touch stream drives the drag itself (it keeps delivering even
		// while the long-press recogniser is active, unlike onDrag)
		if (this.engine.identity !== identity || event.state === TouchEventState.Started) {
			return;
		}

		this.drag(
			{
				...event,
				deltaX: 0,
				deltaY: event.absoluteY - this.armedDragOriginY,
				velocityX: 0,
				velocityY: 0,
			},
			entryIndex,
			identity,
		);
	}

	private begin(entryIndex: number, identity: string): void {
		this.setDragging(identity, true);
		this.engine.begin(entryIndex, identity);
		this.dragEndedIdentity = null;
	}

	private cancel(identity: string): void {
		this.host.setRowVerticalOffset(identity, 0);
		this.engine.settleNeighbours(identity);
		this.setDragging(identity, false);
		this.reset();
	}

	private finalize(entryIndex: number, identity: string, deltaY: number): void {
		if (!this.host.canReorder()) {
			return;
		}

		const drop = this.engine.resolveDrop(entryIndex, deltaY);
		if (!drop) {
			this.cancel(identity);
			return;
		}

		// snap the dragged row to its final slot; leave neighbours shifted, the re-render from
		// onReorder replaces this state without a flash
		this.host.setRowVerticalOffset(identity, drop.snapOffset);
		this.setDragging(identity, false);
		this.host.onDropped(identity);
		// clear stale offset tracking so future drags don't skip animations for elements that
		// happen to share an identity with a previous neighbour
		this.engine.clearNeighbourTracking();
		this.reset();
		this.host.onReorder(entryIndex, drop.targetIndex);
	}

	private releaseLingering(): void {
		if (this.engine.identity) {
			this.host.setRowVerticalOffset(this.engine.identity, 0);
		}
		this.engine.settleNeighbours(this.engine.identity ?? '');
		for (const identity of [...this.draggingIdentities]) {
			this.release(identity);
		}
		this.engine.clearNeighbourTracking();
		this.reset();
	}

	private setDragging(identity: string, isDragging: boolean): void {
		if (!isDragging) {
			this.release(identity);
			return;
		}

		if (!this.host.hasRow(identity)) {
			return;
		}

		// only one row may be selected at a time: releasing any other highlighted row here means
		// a fresh drag can never inherit a previous, slow-releasing selection
		for (const other of this.draggingIdentities) {
			if (other !== identity) {
				this.release(other);
			}
		}

		this.draggingIdentities.add(identity);
		this.host.setRowAppearance(identity, true);
	}
}
