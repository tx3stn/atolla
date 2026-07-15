import { describe, expect, it } from 'bun:test';
import {
	type CancelablePromise,
	promiseToCancelablePromise,
} from 'valdi_core/src/CancelablePromise';
import { CancelableController } from './CancelableController';

function cancelable<T>(promise: Promise<T>, onCancel: () => void = () => {}): CancelablePromise<T> {
	return promiseToCancelablePromise(promise, onCancel);
}

describe('CancelableController', () => {
	it('resolves with the value and alive=true when the owner is not destroyed', async () => {
		const controller = new CancelableController(() => false);
		const result = await controller.run(cancelable(Promise.resolve('ok')));
		expect(result).toEqual({ alive: true, value: 'ok' });
	});

	it('reports alive=false when the owner is destroyed before it resolves', async () => {
		let destroyed = false;
		const controller = new CancelableController(() => destroyed);
		const pending = controller.run(cancelable(Promise.resolve('ok')));
		destroyed = true;
		expect(await pending).toEqual({ alive: false, value: 'ok' });
	});

	it('cancel invokes the operation cancel and clears the reference', () => {
		let cancels = 0;
		const controller = new CancelableController(() => false);
		// never resolves, so the controller stays parked on it
		void controller.run(cancelable(new Promise<string>(() => {}), () => (cancels += 1)));

		controller.cancel();
		expect(cancels).toBe(1);
		// reference cleared, so a second cancel is a no-op
		controller.cancel();
		expect(cancels).toBe(1);
	});

	it('rejects out of run and clears the reference on failure', async () => {
		let cancels = 0;
		const controller = new CancelableController(() => false);
		const operation = cancelable(Promise.reject(new Error('boom')), () => (cancels += 1));

		let caught: unknown;
		try {
			await controller.run(operation);
		} catch (error) {
			caught = error;
		}

		expect(caught).toBeInstanceOf(Error);
		expect((caught as Error).message).toBe('boom');
		// finally cleared the settled operation, so cancel does not reach back into it
		controller.cancel();
		expect(cancels).toBe(0);
	});
});
