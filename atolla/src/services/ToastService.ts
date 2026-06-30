export class ToastService {
	private message: string | null = null;
	private timer?: ReturnType<typeof setTimeout>;
	private readonly listeners = new Set<() => void>();

	getMessage(): string | null {
		return this.message;
	}

	show(message: string, durationMs = 2500): void {
		this.timer = scheduleToastDismiss(
			this.timer,
			(next) => {
				this.message = next;
				this.notify();
			},
			message,
			durationMs,
		);
	}

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	private notify(): void {
		for (const listener of this.listeners) {
			listener();
		}
	}
}

function scheduleToastDismiss(
	activeTimer: ReturnType<typeof setTimeout> | undefined,
	setToastMessage: (message: string | null) => void,
	message: string,
	durationMs: number,
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
