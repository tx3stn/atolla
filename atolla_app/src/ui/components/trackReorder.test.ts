import { describe, expect, it } from 'bun:test';
import {
	edgeScrollDelta,
	neighbourShifts,
	type RowSlot,
	resolveAutoScrollEngagement,
	resolveReorderTarget,
	snapDisplacement,
} from './trackReorder';

const uniform = (count: number, height = 72): Array<RowSlot> => {
	const slots: Array<RowSlot> = [];
	let top = 0;
	for (let i = 0; i < count; i++) {
		slots.push({ height, top });
		top += height;
	}
	return slots;
};

const mixed = (heights: Array<number>): Array<RowSlot> => {
	const slots: Array<RowSlot> = [];
	let top = 0;
	for (const height of heights) {
		slots.push({ height, top });
		top += height;
	}
	return slots;
};

const centre = (slots: Array<RowSlot>, fromIndex: number, deltaY: number): number =>
	slots[fromIndex].top + slots[fromIndex].height / 2 + deltaY;

describe('resolveReorderTarget', () => {
	it('keeps the row in place when the centre stays within its own slot', () => {
		const slots = uniform(3);
		expect(resolveReorderTarget(slots, 0, centre(slots, 0, 10))).toBe(0);
	});

	it('moves down once the centre enters the next slot (uniform)', () => {
		const slots = uniform(3);
		expect(resolveReorderTarget(slots, 0, centre(slots, 0, 70))).toBe(1);
	});

	it('moves up once the centre enters the previous slot (uniform)', () => {
		const slots = uniform(3);
		expect(resolveReorderTarget(slots, 1, centre(slots, 1, -70))).toBe(0);
	});

	it('clamps to the first slot when dragged far above the list', () => {
		const slots = uniform(3);
		expect(resolveReorderTarget(slots, 1, centre(slots, 1, -300))).toBe(0);
	});

	it('clamps to the last slot when dragged far below the list', () => {
		const slots = uniform(3);
		expect(resolveReorderTarget(slots, 0, centre(slots, 0, 300))).toBe(2);
	});

	it('uses real heights so a tall neighbour needs more travel than a short one', () => {
		const slots = mixed([58, 76, 58]);
		// row0 centre at 29, row1 span [58,134): 40px enters row1 (69)
		expect(resolveReorderTarget(slots, 0, centre(slots, 0, 40))).toBe(1);
		// 20px keeps it in slot0 [0,58): 49
		expect(resolveReorderTarget(slots, 0, centre(slots, 0, 20))).toBe(0);
	});

	it('moves a tall row down only once its centre clears the short row below', () => {
		const slots = mixed([76, 58, 58]);
		// row0 centre at 38, slot1 span [76,134): 30px stays in slot0 (68)
		expect(resolveReorderTarget(slots, 0, centre(slots, 0, 30))).toBe(0);
		// 50px clears into slot1 (88)
		expect(resolveReorderTarget(slots, 0, centre(slots, 0, 50))).toBe(1);
	});
});

describe('neighbourShifts', () => {
	it('returns nothing when target equals origin', () => {
		expect(neighbourShifts(uniform(3), 1, 1)).toEqual([]);
	});

	it('shifts leap-frogged rows up by the dragged row height when moving down', () => {
		const slots = mixed([58, 76, 60]);
		// drag row0 (h58) down to index 2: rows 1 and 2 shift up by 58
		expect(neighbourShifts(slots, 0, 2)).toEqual([
			{ index: 1, offset: -58 },
			{ index: 2, offset: -58 },
		]);
	});

	it('shifts leap-frogged rows down by the dragged row height when moving up', () => {
		const slots = mixed([58, 76, 60]);
		// drag row2 (h60) up to index 0: rows 0 and 1 shift down by 60
		expect(neighbourShifts(slots, 2, 0)).toEqual([
			{ index: 0, offset: 60 },
			{ index: 1, offset: 60 },
		]);
	});
});

describe('snapDisplacement', () => {
	it('is zero when target equals origin', () => {
		expect(snapDisplacement(uniform(3), 1, 1)).toBe(0);
	});

	it('moving down equals the summed heights of the rows leap-frogged', () => {
		const slots = mixed([58, 76, 60]);
		// row0 down to index 2 must travel past row1 (76) and row2 (60)
		expect(snapDisplacement(slots, 0, 2)).toBe(136);
	});

	it('moving up is negative and equals the summed heights leap-frogged', () => {
		const slots = mixed([58, 76, 60]);
		// row2 up to index 0 travels past row0 (58) and row1 (76)
		expect(snapDisplacement(slots, 2, 0)).toBe(-134);
	});

	it('reproduces a single uniform slot step for the fallback path', () => {
		expect(snapDisplacement(uniform(2, 72), 0, 1)).toBe(72);
	});
});

describe('edgeScrollDelta', () => {
	const viewport = { bottom: 600, top: 100 };

	it('returns zero in the middle of the viewport', () => {
		expect(edgeScrollDelta(350, viewport, 80, 12)).toBe(0);
	});

	it('returns a negative delta near the top edge', () => {
		expect(edgeScrollDelta(110, viewport, 80, 12)).toBeLessThan(0);
	});

	it('returns a positive delta near the bottom edge', () => {
		expect(edgeScrollDelta(590, viewport, 80, 12)).toBeGreaterThan(0);
	});

	it('ramps to the full step at (or beyond) the edge', () => {
		expect(edgeScrollDelta(100, viewport, 80, 12)).toBe(-12);
		expect(edgeScrollDelta(50, viewport, 80, 12)).toBe(-12);
		expect(edgeScrollDelta(600, viewport, 80, 12)).toBe(12);
	});
});

describe('resolveAutoScrollEngagement', () => {
	const TOLERANCE = 8;

	it('engages when the finger first reaches an edge zone', () => {
		expect(resolveAutoScrollEngagement(null, 580, 1, TOLERANCE)).toEqual({
			anchorY: 580,
			direction: 1,
			engaged: true,
		});
	});

	it('re-anchors and engages when the finger crosses to the opposite edge', () => {
		const atBottom = { anchorY: 580, direction: 1, engaged: false };
		expect(resolveAutoScrollEngagement(atBottom, 110, -1, TOLERANCE)).toEqual({
			anchorY: 110,
			direction: -1,
			engaged: true,
		});
	});

	it('keeps scrolling while the finger is held still at the edge', () => {
		const engaged = { anchorY: 580, direction: 1, engaged: true };
		expect(resolveAutoScrollEngagement(engaged, 580, 1, TOLERANCE)).toEqual(engaged);
	});

	it('holds state and the anchor for jitter inside the tolerance', () => {
		const engaged = { anchorY: 580, direction: 1, engaged: true };
		expect(resolveAutoScrollEngagement(engaged, 573, 1, TOLERANCE)).toEqual(engaged);
		expect(resolveAutoScrollEngagement(engaged, 587, 1, TOLERANCE)).toEqual(engaged);
	});

	it('disengages once the finger drags away from the edge beyond the tolerance', () => {
		const engaged = { anchorY: 580, direction: 1, engaged: true };
		expect(resolveAutoScrollEngagement(engaged, 560, 1, TOLERANCE)).toEqual({
			anchorY: 560,
			direction: 1,
			engaged: false,
		});
	});

	it('stays disengaged while the finger keeps dragging away from the edge', () => {
		let engagement = resolveAutoScrollEngagement(
			{ anchorY: 580, direction: 1, engaged: true },
			560,
			1,
			TOLERANCE,
		);
		for (const fingerY of [540, 520, 500]) {
			engagement = resolveAutoScrollEngagement(engagement, fingerY, 1, TOLERANCE);
			expect(engagement.engaged).toBe(false);
		}
	});

	it('does not revive a disengaged scroll on jitter toward the edge', () => {
		const disengaged = { anchorY: 560, direction: 1, engaged: false };
		expect(resolveAutoScrollEngagement(disengaged, 566, 1, TOLERANCE)).toEqual(disengaged);
	});

	it('re-engages when the finger deliberately pushes back toward the edge', () => {
		const disengaged = { anchorY: 560, direction: 1, engaged: false };
		expect(resolveAutoScrollEngagement(disengaged, 580, 1, TOLERANCE)).toEqual({
			anchorY: 580,
			direction: 1,
			engaged: true,
		});
	});

	it('measures travel toward the top edge as upward movement', () => {
		const engaged = { anchorY: 120, direction: -1, engaged: true };
		expect(resolveAutoScrollEngagement(engaged, 140, -1, TOLERANCE).engaged).toBe(false);
		expect(resolveAutoScrollEngagement(engaged, 100, -1, TOLERANCE).engaged).toBe(true);
	});
});
