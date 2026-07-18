import { describe, expect, it } from 'bun:test';
import { SpinnerController } from './SpinnerController';

describe('SpinnerController', () => {
	it('forwards start and stop to the attached handle', () => {
		const calls: Array<string> = [];
		const controller = new SpinnerController();
		controller.attach({
			start: () => calls.push('start'),
			stop: () => calls.push('stop'),
		});

		controller.start();
		controller.stop();

		expect(calls).toEqual(['start', 'stop']);
	});

	it('is a no-op before a handle is attached', () => {
		const controller = new SpinnerController();

		expect(() => {
			controller.start();
			controller.stop();
		}).not.toThrow();
	});

	it('stops forwarding once detached', () => {
		const calls: Array<string> = [];
		const controller = new SpinnerController();
		controller.attach({
			start: () => calls.push('start'),
			stop: () => calls.push('stop'),
		});

		controller.detach();
		controller.start();
		controller.stop();

		expect(calls).toEqual([]);
	});
});
