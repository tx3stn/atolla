import { setTimeoutInterruptible } from 'valdi_core/src/SetTimeout';
import {
	type AutoScrollEngagement,
	edgeScrollDelta,
	neighbourShifts,
	type RowSlot,
	resolveAutoScrollEngagement,
	resolveReorderTarget,
	snapDisplacement,
} from './listReorder';
import type { DragAutoScroller } from './ScrollDragAutoScroller';

const AUTO_SCROLL_EDGE = 65;
// pixels moved per tick
const AUTO_SCROLL_STEP = 15;
// tick period in ms - 16 is optimal for the display refresh
const AUTO_SCROLL_INTERVAL = 16;
// finger travel that flips auto-scroll on or off, large enough that a slow drag's jitter
// doesn't keep reviving a scroll the finger is pulling away from
const AUTO_SCROLL_REVERSE_TOLERANCE = 8;

const NEIGHBOUR_SHIFT_SECONDS = 0.13;
const NEIGHBOUR_SETTLE_SECONDS = 0.18;

export interface DragReorderHost {
	dragScroller(): DragAutoScroller | undefined;
	identities(): Array<string>;
	isDestroyed(): boolean;
	measureSlots(): Array<RowSlot>;
	rowViewportCentre(identity: string): number | undefined;
	setRowOffset(identity: string, offset: number, durationSeconds?: number): void;
}

export interface DragDrop {
	snapOffset: number;
	targetIndex: number;
}

export class DragReorderEngine {
	private autoScrollEngagement: AutoScrollEngagement | null = null;
	private autoScrollTimeout: ReturnType<typeof setTimeout> | null = null;
	private draggedIdentity: string | null = null;
	private from = -1;
	private lastDelta = 0;
	private neighbourOffsetByIdentity = new Map<string, number>();
	private scrollAccum = 0;
	private slots: Array<RowSlot> = [];

	constructor(private readonly host: DragReorderHost) {}

	get fromIndex(): number {
		return this.from;
	}

	get identity(): string | null {
		return this.draggedIdentity;
	}

	get lastDeltaY(): number {
		return this.lastDelta;
	}

	begin(entryIndex: number, identity: string): void {
		this.slots = this.host.measureSlots();
		this.from = entryIndex;
		this.draggedIdentity = identity;
		this.scrollAccum = 0;
	}

	clearNeighbourTracking(): void {
		this.neighbourOffsetByIdentity.clear();
	}

	move(deltaY: number): void {
		this.lastDelta = deltaY;
		this.updateAutoScroll();
		this.applyDragPosition();
	}

	reset(): void {
		this.stopAutoScroll();
		this.slots = [];
		this.from = -1;
		this.draggedIdentity = null;
		this.scrollAccum = 0;
		this.lastDelta = 0;
		this.autoScrollEngagement = null;
		this.host.dragScroller()?.setScrollEnabled(true);
	}

	// the index this row should land on, with the offset that snaps it there. undefined when the
	// row has no measurable slot or has not moved far enough to change places.
	resolveDrop(entryIndex: number, deltaY: number): DragDrop | undefined {
		const slots = this.slotsFor(entryIndex);
		const accum = this.from === entryIndex ? this.scrollAccum : 0;
		const slot = slots[entryIndex];
		if (!slot) {
			return undefined;
		}

		const targetIndex = resolveReorderTarget(
			slots,
			entryIndex,
			slot.top + slot.height / 2 + deltaY + accum,
		);
		if (targetIndex === entryIndex) {
			return undefined;
		}

		return { snapOffset: snapDisplacement(slots, entryIndex, targetIndex), targetIndex };
	}

	settleNeighbours(draggingIdentity: string): void {
		for (const identity of this.host.identities()) {
			if (identity === draggingIdentity) {
				continue;
			}
			if ((this.neighbourOffsetByIdentity.get(identity) ?? 0) === 0) {
				continue;
			}
			this.neighbourOffsetByIdentity.set(identity, 0);
			this.host.setRowOffset(identity, 0, NEIGHBOUR_SETTLE_SECONDS);
		}
	}

	stopAutoScroll(): void {
		if (this.autoScrollTimeout) {
			clearTimeout(this.autoScrollTimeout);
			this.autoScrollTimeout = null;
		}
	}

	private applyDragPosition(): void {
		if (this.from < 0 || !this.draggedIdentity) {
			return;
		}
		const slot = this.slots[this.from];
		if (!slot) {
			return;
		}

		this.host.setRowOffset(this.draggedIdentity, this.lastDelta + this.scrollAccum);
		const centre = slot.top + slot.height / 2 + this.lastDelta + this.scrollAccum;
		this.updateNeighbourOffsets(resolveReorderTarget(this.slots, this.from, centre));
	}

	private autoScrollTick = (): void => {
		this.autoScrollTimeout = null;
		if (this.host.isDestroyed()) {
			return;
		}

		const before = this.scrollAccum;
		this.performAutoScrollStep();
		// stop if the edge was left or a scroll bound was hit (no movement applied)
		if (this.scrollAccum === before) {
			return;
		}
		this.autoScrollTimeout = setTimeoutInterruptible(this.autoScrollTick, AUTO_SCROLL_INTERVAL);
	};

	private performAutoScrollStep(): void {
		if (!this.autoScrollEngagement?.engaged || !this.draggedIdentity) {
			return;
		}
		const scroller = this.host.dragScroller();
		const viewport = scroller?.viewport();
		const rowY = this.host.rowViewportCentre(this.draggedIdentity);
		if (!scroller || !viewport || rowY === undefined) {
			return;
		}
		const desired = edgeScrollDelta(rowY, viewport, AUTO_SCROLL_EDGE, AUTO_SCROLL_STEP);
		if (desired === 0) {
			return;
		}
		const applied = scroller.scrollBy(desired);
		if (applied === 0) {
			return;
		}
		this.scrollAccum += applied;
		this.applyDragPosition();
	}

	private slotsFor(entryIndex: number): Array<RowSlot> {
		if (this.from === entryIndex && this.slots.length === this.host.identities().length) {
			return this.slots;
		}
		return this.host.measureSlots();
	}

	private updateAutoScroll(): void {
		const scroller = this.host.dragScroller();
		if (!scroller || !this.draggedIdentity) {
			return;
		}
		const viewport = scroller.viewport();
		const rowY = this.host.rowViewportCentre(this.draggedIdentity);
		const desired =
			viewport && rowY !== undefined
				? edgeScrollDelta(rowY, viewport, AUTO_SCROLL_EDGE, AUTO_SCROLL_STEP)
				: 0;

		if (desired === 0 || rowY === undefined) {
			this.autoScrollEngagement = null;
			this.stopAutoScroll();
			return;
		}

		// never make the finger fight the scroll: dragging away from an edge cancels it and
		// dragging back toward the edge resumes it, while a finger held at the edge keeps
		// scrolling via the timer tick below
		this.autoScrollEngagement = resolveAutoScrollEngagement(
			this.autoScrollEngagement,
			rowY,
			Math.sign(desired),
			AUTO_SCROLL_REVERSE_TOLERANCE,
		);
		if (!this.autoScrollEngagement.engaged) {
			this.stopAutoScroll();
			return;
		}

		// scroll once immediately on reaching an edge for responsiveness, then keep
		// scrolling on a timer while the finger is held there
		if (this.autoScrollTimeout === null) {
			this.performAutoScrollStep();
			this.autoScrollTimeout = setTimeoutInterruptible(this.autoScrollTick, AUTO_SCROLL_INTERVAL);
		}
	}

	private updateNeighbourOffsets(targetIndex: number): void {
		const shifts = new Map<number, number>();
		for (const shift of neighbourShifts(this.slots, this.from, targetIndex)) {
			shifts.set(shift.index, shift.offset);
		}

		const identities = this.host.identities();
		for (let i = 0; i < identities.length; i++) {
			if (i === this.from) {
				continue;
			}
			const identity = identities[i];
			if (!identity) {
				continue;
			}

			const offset = shifts.get(i) ?? 0;
			if (offset === (this.neighbourOffsetByIdentity.get(identity) ?? 0)) {
				continue;
			}

			this.neighbourOffsetByIdentity.set(identity, offset);
			this.host.setRowOffset(identity, offset, NEIGHBOUR_SHIFT_SECONDS);
		}
	}
}
