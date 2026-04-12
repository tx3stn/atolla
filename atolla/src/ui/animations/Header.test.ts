import { describe, expect, it } from 'bun:test';
import { createHeaderVisibilityTouchHandler } from './Header';

const TouchEventState = { Changed: 1, Ended: 2, Started: 0 } as const;

describe('createHeaderVisibilityTouchHandler', () => {
	it('hides after accumulated upward delta crosses threshold', () => {
		let isVisible = true;
		const updates: Array<boolean> = [];
		const handleTouch = createHeaderVisibilityTouchHandler({
			getIsHeaderVisible: () => isVisible,
			onHeaderVisibilityChange: (nextVisible) => {
				isVisible = nextVisible;
				updates.push(nextVisible);
			},
		});

		handleTouch({ deltaX: 0, deltaY: 0, state: TouchEventState.Started });
		handleTouch({ deltaX: 1, deltaY: -8, state: TouchEventState.Changed });
		handleTouch({ deltaX: 0, deltaY: -7, state: TouchEventState.Changed });
		handleTouch({ deltaX: 0, deltaY: -4, state: TouchEventState.Changed });

		expect(updates).toEqual([false]);
	});

	it('shows after accumulated downward delta crosses threshold', () => {
		let isVisible = false;
		const updates: Array<boolean> = [];
		const handleTouch = createHeaderVisibilityTouchHandler({
			getIsHeaderVisible: () => isVisible,
			onHeaderVisibilityChange: (nextVisible) => {
				isVisible = nextVisible;
				updates.push(nextVisible);
			},
		});

		handleTouch({ deltaX: 0, deltaY: 0, state: TouchEventState.Started });
		handleTouch({ deltaX: 0, deltaY: 4, state: TouchEventState.Changed });
		handleTouch({ deltaX: 1, deltaY: 5, state: TouchEventState.Changed });
		handleTouch({ deltaX: 0, deltaY: 4, state: TouchEventState.Changed });

		expect(updates).toEqual([true]);
	});

	it('ignores horizontal movement', () => {
		const updates: Array<boolean> = [];
		const handleTouch = createHeaderVisibilityTouchHandler({
			getIsHeaderVisible: () => true,
			onHeaderVisibilityChange: (nextVisible) => {
				updates.push(nextVisible);
			},
		});

		handleTouch({ deltaX: 0, deltaY: 0, state: TouchEventState.Started });
		handleTouch({ deltaX: 20, deltaY: -8, state: TouchEventState.Changed });
		handleTouch({ deltaX: 20, deltaY: -8, state: TouchEventState.Changed });

		expect(updates).toEqual([]);
	});

	it('resets accumulation at end of touch sequence', () => {
		let isVisible = true;
		const updates: Array<boolean> = [];
		const handleTouch = createHeaderVisibilityTouchHandler({
			getIsHeaderVisible: () => isVisible,
			onHeaderVisibilityChange: (nextVisible) => {
				isVisible = nextVisible;
				updates.push(nextVisible);
			},
		});

		handleTouch({ deltaX: 0, deltaY: 0, state: TouchEventState.Started });
		handleTouch({ deltaX: 0, deltaY: -6, state: TouchEventState.Changed });
		handleTouch({ deltaX: 0, deltaY: 0, state: TouchEventState.Ended });
		handleTouch({ deltaX: 0, deltaY: 0, state: TouchEventState.Started });
		handleTouch({ deltaX: 0, deltaY: -6, state: TouchEventState.Changed });

		expect(updates).toEqual([]);
	});
});
