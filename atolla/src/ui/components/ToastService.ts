import { scheduleToastDismiss } from './toastTimer';

export class ToastService {
	private message: string | null = null;
	private timer?: ReturnType<typeof setTimeout>;
	private readonly listeners = new Set<() => void>();

	getMessage(): string | null {
		return this.message;
	}

	show(message: string, durationMs = 2000): void {
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
