import { describe, expect, it } from 'bun:test';
import { type CancelablePromise, PromiseCanceler } from 'valdi_core/src/CancelablePromise';
import { tracked } from './Cancelable';

function requestWithCancel(cancel: () => void): CancelablePromise<unknown> {
	return { cancel } as CancelablePromise<unknown>;
}

describe('tracked', () => {
	it('lets a failing cancel surface instead of swallowing it', () => {
		const canceler = new PromiseCanceler();
		const request = requestWithCancel(() => {
			throw new Error('cancel failed');
		});

		tracked(canceler, request);

		expect(() => canceler.cancel()).toThrow('cancel failed');
	});

	it('forwards cancel to the tracked request', () => {
		const canceler = new PromiseCanceler();
		let canceled = false;
		const request = requestWithCancel(() => {
			canceled = true;
		});

		tracked(canceler, request);
		canceler.cancel();

		expect(canceled).toBe(true);
	});
});
