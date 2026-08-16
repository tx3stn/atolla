export const ToastTypes = {
	error: 'error',
	info: 'info',
	progress: 'progress',
	success: 'success',
} as const;

export type ToastType = (typeof ToastTypes)[keyof typeof ToastTypes];

export interface ToastModel {
	// secondary line revealed in-place when the toast is tapped (e.g. a partial sync's failure summary).
	// its presence makes the toast tappable-to-expand; a long message is also tappable to unclamp.
	detail?: string;
	message: string;
	// when set the tap runs this action instead of expanding (e.g. a partial sync opens the error modal)
	onTap?: () => void;
	variant: ToastType;
}

// what the renderer consumes: the model plus whether it is animating out before removal
export interface ActiveToast {
	closing: boolean;
	model: ToastModel;
}

// single-slot toast store. transient toasts auto-dismiss; the progress toast is persistent until
// replaced. dismissal is two-phase (startClose → dismissed) so the renderer can animate out before
// the slot clears. auto-dismiss timers live here, never in the component.
export class ToastService {
	private current: ActiveToast | null = null;
	private timer?: ReturnType<typeof setTimeout>;
	private readonly listeners = new Set<() => void>();

	// removes the current toast immediately (no exit animation). called by the renderer once its exit
	// animation has finished, or directly when animations are disabled.
	dismissed(): void {
		this.timer = clearToastTimer(this.timer);
		if (this.current) {
			this.current = null;
			this.notify();
		}
	}

	getCurrent(): ActiveToast | null {
		return this.current;
	}

	// transient: shows the toast and schedules it to begin closing after durationMs
	show(model: ToastModel, durationMs = 2500): void {
		this.timer = clearToastTimer(this.timer);
		this.current = { closing: false, model };
		this.notify();
		this.timer = setTimeout(() => {
			this.startClose();
		}, durationMs);
	}

	// persistent: shows the toast with no auto-dismiss (used for in-progress sync). calling again
	// replaces the model, so progress updates flow through here.
	showPersistent(model: ToastModel): void {
		this.timer = clearToastTimer(this.timer);
		this.current = { closing: false, model };
		this.notify();
	}

	// marks the current toast as closing so the renderer animates it out
	startClose(): void {
		this.timer = clearToastTimer(this.timer);
		if (this.current && !this.current.closing) {
			this.current = { closing: true, model: this.current.model };
			this.notify();
		}
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

function clearToastTimer(timer: ReturnType<typeof setTimeout> | undefined): undefined {
	if (timer) {
		clearTimeout(timer);
	}

	return undefined;
}
