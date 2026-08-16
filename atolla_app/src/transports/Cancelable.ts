import { type CancelablePromise, PromiseCanceler } from 'valdi_core/src/CancelablePromise';

// Runs an async body whose returned promise can be canceled: the PromiseCanceler
// handed to `run` forwards a `.cancel()` on the returned promise to whichever
// request is in flight (each registered via `tracked`). `run` executes
// synchronously up to its first await, so the in-flight request's cancel is wired
// before the promise is handed back. Cancelling a settled request is a no-op.
export function cancelable<T>(
	run: (canceler: PromiseCanceler) => Promise<T>,
): CancelablePromise<T> {
	const canceler = new PromiseCanceler();
	return canceler.toCancelablePromise(run(canceler));
}

// Registers the in-flight request's cancel with the canceler and returns it, so a
// caller can `await tracked(canceler, this.client.get(...))`.
export function tracked<T>(
	canceler: PromiseCanceler,
	request: CancelablePromise<T>,
): CancelablePromise<T> {
	canceler.onCancel(() => {
		try {
			request.cancel?.();
		} catch {
			// valdi's native HTTP cancel throws due to a bug, so just ignore for now.
		}
	});
	return request;
}
