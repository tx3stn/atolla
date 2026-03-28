export function scheduleToastDismiss(
	activeTimer: ReturnType<typeof setTimeout> | undefined,
	setToastMessage: (message: string | null) => void,
	message: string,
	durationMs = 2000,
): ReturnType<typeof setTimeout> {
	if (activeTimer) {
		clearTimeout(activeTimer);
	}

	setToastMessage(message);
	return setTimeout(() => {
		setToastMessage(null);
	}, durationMs);
}

export function clearScheduledToast(
	activeTimer: ReturnType<typeof setTimeout> | undefined,
): undefined {
	if (activeTimer) {
		clearTimeout(activeTimer);
	}

	return undefined;
}
