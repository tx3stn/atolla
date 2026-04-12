export interface HeaderTouchEvent {
	deltaX: number;
	deltaY: number;
	state: number;
	velocityX?: number;
	velocityY?: number;
}

interface HeaderVisibilityTouchHandlerDependencies {
	getIsHeaderVisible: () => boolean;
	hideThreshold?: number;
	onDebug?: (snapshot: HeaderGestureDebugSnapshot) => void;
	onHeaderVisibilityChange: (isVisible: boolean) => void;
	showThreshold?: number;
}

export interface HeaderGestureDebugSnapshot {
	accumulatedDeltaY: number;
	action: 'end' | 'hide' | 'ignored' | 'none' | 'show';
	deltaX: number;
	deltaY: number;
	headerVisible: boolean;
	reason?: string;
	state: number;
	velocityX: number;
	velocityY: number;
}

const TouchEventState = { Ended: 2 } as const;

export function createHeaderVisibilityTouchHandler(
	dependencies: HeaderVisibilityTouchHandlerDependencies,
): (event: HeaderTouchEvent) => void {
	let accumulatedDeltaY = 0;
	const hideThreshold = dependencies.hideThreshold ?? 10;
	const showThreshold = dependencies.showThreshold ?? 8;

	return (event: HeaderTouchEvent): void => {
		const toNumber = (value: unknown): number =>
			typeof value === 'number' && Number.isFinite(value) ? value : 0;
		const deltaX = toNumber(event.deltaX);
		const deltaY = toNumber(event.deltaY);
		const velocityX = toNumber(event.velocityX);
		const velocityY = toNumber(event.velocityY);
		const headerVisible = dependencies.getIsHeaderVisible();

		if (event.state === TouchEventState.Ended) {
			if (
				accumulatedDeltaY === 0 &&
				Math.abs(velocityY) > Math.abs(velocityX) &&
				Math.abs(velocityY) >= 0.4
			) {
				if (velocityY < 0 && headerVisible) {
					dependencies.onHeaderVisibilityChange(false);
					dependencies.onDebug?.({
						accumulatedDeltaY,
						action: 'hide',
						deltaX,
						deltaY,
						headerVisible,
						reason: 'end-velocity',
						state: event.state,
						velocityX,
						velocityY,
					});
					return;
				}

				if (velocityY > 0 && !headerVisible) {
					dependencies.onHeaderVisibilityChange(true);
					dependencies.onDebug?.({
						accumulatedDeltaY,
						action: 'show',
						deltaX,
						deltaY,
						headerVisible,
						reason: 'end-velocity',
						state: event.state,
						velocityX,
						velocityY,
					});
					return;
				}
			}

			dependencies.onDebug?.({
				accumulatedDeltaY,
				action: 'end',
				deltaX,
				deltaY,
				headerVisible,
				state: event.state,
				velocityX,
				velocityY,
			});
			accumulatedDeltaY = 0;
			return;
		}

		if (Math.abs(deltaY) < 1) {
			dependencies.onDebug?.({
				accumulatedDeltaY,
				action: 'ignored',
				deltaX,
				deltaY,
				headerVisible,
				reason: 'noise',
				state: event.state,
				velocityX,
				velocityY,
			});
			return;
		}

		if (Math.abs(deltaY) <= Math.abs(deltaX) * 0.5) {
			dependencies.onDebug?.({
				accumulatedDeltaY,
				action: 'ignored',
				deltaX,
				deltaY,
				headerVisible,
				reason: 'axis',
				state: event.state,
				velocityX,
				velocityY,
			});
			return;
		}

		if (accumulatedDeltaY !== 0 && Math.sign(accumulatedDeltaY) !== Math.sign(deltaY)) {
			accumulatedDeltaY = 0;
		}

		accumulatedDeltaY += deltaY;

		if (accumulatedDeltaY <= -hideThreshold && headerVisible) {
			dependencies.onHeaderVisibilityChange(false);
			dependencies.onDebug?.({
				accumulatedDeltaY,
				action: 'hide',
				deltaX,
				deltaY,
				headerVisible,
				state: event.state,
				velocityX,
				velocityY,
			});
			accumulatedDeltaY = 0;
			return;
		}

		if (accumulatedDeltaY >= showThreshold && !headerVisible) {
			dependencies.onHeaderVisibilityChange(true);
			dependencies.onDebug?.({
				accumulatedDeltaY,
				action: 'show',
				deltaX,
				deltaY,
				headerVisible,
				state: event.state,
				velocityX,
				velocityY,
			});
			accumulatedDeltaY = 0;
			return;
		}

		dependencies.onDebug?.({
			accumulatedDeltaY,
			action: 'none',
			deltaX,
			deltaY,
			headerVisible,
			state: event.state,
			velocityX,
			velocityY,
		});
	};
}
