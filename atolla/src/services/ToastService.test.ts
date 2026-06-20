import { describe, expect, it } from 'bun:test';
import { ToastService } from './ToastService';

describe('ToastService', () => {
	it('has no message initially', () => {
		const service = new ToastService();

		expect(service.getMessage()).toBeNull();
	});

	it('shows a message and notifies subscribers', () => {
		const service = new ToastService();
		let notifications = 0;
		service.subscribe(() => {
			notifications += 1;
		});

		service.show('Added to playlist');

		expect(service.getMessage()).toBe('Added to playlist');
		expect(notifications).toBe(1);
	});

	it('replaces the current message when shown again', () => {
		const service = new ToastService();

		service.show('first');
		service.show('second');

		expect(service.getMessage()).toBe('second');
	});

	it('auto-dismisses the message after the duration', async () => {
		const service = new ToastService();

		service.show('temporary', 5);
		expect(service.getMessage()).toBe('temporary');

		await new Promise((resolve) => setTimeout(resolve, 20));

		expect(service.getMessage()).toBeNull();
	});

	it('stops notifying after unsubscribe', () => {
		const service = new ToastService();
		let notifications = 0;
		const unsubscribe = service.subscribe(() => {
			notifications += 1;
		});

		unsubscribe();
		service.show('ignored');

		expect(notifications).toBe(0);
	});
});
