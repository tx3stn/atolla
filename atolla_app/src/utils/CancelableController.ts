import type { CancelablePromise } from 'valdi_core/src/CancelablePromise';

export class CancelableController {
	private current?: { cancel?(): void };

	constructor(private readonly isDestroyed: () => boolean) {}

	cancel = (): void => {
		this.current?.cancel?.();
		this.current = undefined;
	};

	async run<T>(operation: CancelablePromise<T>): Promise<{ alive: boolean; value: T }> {
		this.current = operation;
		try {
			const value = await operation;
			return { alive: !this.isDestroyed(), value };
		} finally {
			this.current = undefined;
		}
	}
}
