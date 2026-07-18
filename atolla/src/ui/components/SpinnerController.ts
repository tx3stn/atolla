export interface SpinnerHandle {
	start(): void;
	stop(): void;
}

export class SpinnerController {
	private handle?: SpinnerHandle;

	attach(handle: SpinnerHandle): void {
		this.handle = handle;
	}

	detach(): void {
		this.handle = undefined;
	}

	start(): void {
		this.handle?.start();
	}

	stop(): void {
		this.handle?.stop();
	}
}
