export interface RowSlot {
	height: number;
	top: number;
}

/**
 * Index of the slot whose vertical span contains the dragged row's centre,
 * clamped to the list bounds. Driven entirely by measured geometry so rows of
 * any height land in the correct ordered position.
 */
export function resolveReorderTarget(
	slots: Array<RowSlot>,
	fromIndex: number,
	draggedCentre: number,
): number {
	const lastIndex = slots.length - 1;
	if (lastIndex < 0) return fromIndex;

	if (draggedCentre < slots[0].top) return 0;

	for (let i = 0; i <= lastIndex; i++) {
		const slot = slots[i];
		if (draggedCentre < slot.top + slot.height) return i;
	}

	return lastIndex;
}

/**
 * Rows that the dragged row leap-frogs shift by the dragged row's own height to
 * open an exact gap: up when moving the row down, down when moving it up.
 */
export function neighbourShifts(
	slots: Array<RowSlot>,
	fromIndex: number,
	targetIndex: number,
): Array<{ index: number; offset: number }> {
	if (targetIndex === fromIndex) return [];

	const draggedHeight = slots[fromIndex].height;
	const shifts: Array<{ index: number; offset: number }> = [];

	if (targetIndex > fromIndex) {
		for (let i = fromIndex + 1; i <= targetIndex; i++) {
			shifts.push({ index: i, offset: -draggedHeight });
		}
	} else {
		for (let i = targetIndex; i < fromIndex; i++) {
			shifts.push({ index: i, offset: draggedHeight });
		}
	}

	return shifts;
}

/**
 * Signed pixels the dragged row must travel to settle into targetIndex: the
 * summed heights of the rows it leap-frogs (positive down, negative up).
 */
export function snapDisplacement(
	slots: Array<RowSlot>,
	fromIndex: number,
	targetIndex: number,
): number {
	if (targetIndex === fromIndex) return 0;

	let displacement = 0;
	if (targetIndex > fromIndex) {
		for (let i = fromIndex + 1; i <= targetIndex; i++) displacement += slots[i].height;
		return displacement;
	}

	for (let i = targetIndex; i < fromIndex; i++) displacement -= slots[i].height;
	return displacement;
}

/**
 * Auto-scroll amount for a single tick while the finger is held near a viewport
 * edge during a drag. Negative scrolls the content up (towards the top), positive
 * down. The magnitude ramps linearly with proximity and saturates at `maxStep`.
 */
export function edgeScrollDelta(
	fingerY: number,
	viewport: { bottom: number; top: number },
	edge: number,
	maxStep: number,
): number {
	const topThreshold = viewport.top + edge;
	if (fingerY <= topThreshold) {
		const proximity = Math.min(1, (topThreshold - fingerY) / edge);
		return -maxStep * proximity;
	}

	const bottomThreshold = viewport.bottom - edge;
	if (fingerY >= bottomThreshold) {
		const proximity = Math.min(1, (fingerY - bottomThreshold) / edge);
		return maxStep * proximity;
	}

	return 0;
}
