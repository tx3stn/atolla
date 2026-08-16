import { describe, expect, it } from 'bun:test';
import { ToastService, ToastTypes } from './ToastService';

describe('ToastService', () => {
	it('has no toast initially', () => {
		const service = new ToastService();

		expect(service.getCurrent()).toBeNull();
	});

	it('shows a toast and notifies subscribers', () => {
		const service = new ToastService();
		let notifications = 0;
		service.subscribe(() => {
			notifications += 1;
		});

		service.show({ message: 'Added to playlist', variant: ToastTypes.success });

		expect(service.getCurrent()).toEqual({
			closing: false,
			model: { message: 'Added to playlist', variant: ToastTypes.success },
		});
		expect(notifications).toBe(1);
	});

	it('replaces the current toast when shown again', () => {
		const service = new ToastService();

		service.show({ message: 'first', variant: ToastTypes.success });
		service.show({ message: 'second', variant: ToastTypes.error });

		expect(service.getCurrent()?.model.message).toBe('second');
		expect(service.getCurrent()?.model.variant).toBe(ToastTypes.error);
	});

	it('keeps a persistent toast without auto-dismissing', async () => {
		const service = new ToastService();

		service.showPersistent({ message: 'syncing', variant: ToastTypes.progress });
		await new Promise((resolve) => setTimeout(resolve, 20));

		expect(service.getCurrent()?.closing).toBe(false);
		expect(service.getCurrent()?.model.message).toBe('syncing');
	});

	it('begins closing after the duration elapses', async () => {
		const service = new ToastService();

		service.show({ message: 'temporary', variant: ToastTypes.success }, 5);
		expect(service.getCurrent()?.closing).toBe(false);

		await new Promise((resolve) => setTimeout(resolve, 20));

		expect(service.getCurrent()?.closing).toBe(true);
	});

	it('removes the toast when dismissed', () => {
		const service = new ToastService();

		service.show({ message: 'gone', variant: ToastTypes.success });
		service.dismissed();

		expect(service.getCurrent()).toBeNull();
	});

	it('marks the current toast as closing on startClose', () => {
		const service = new ToastService();

		service.showPersistent({ message: 'syncing', variant: ToastTypes.progress });
		service.startClose();

		expect(service.getCurrent()?.closing).toBe(true);
	});

	it('cancels a pending close when a new toast is shown', () => {
		const service = new ToastService();

		service.showPersistent({ message: 'syncing', variant: ToastTypes.progress });
		service.startClose();
		service.show({ message: 'synced', variant: ToastTypes.success });

		expect(service.getCurrent()?.closing).toBe(false);
		expect(service.getCurrent()?.model.message).toBe('synced');
	});

	it('stops notifying after unsubscribe', () => {
		const service = new ToastService();
		let notifications = 0;
		const unsubscribe = service.subscribe(() => {
			notifications += 1;
		});

		unsubscribe();
		service.show({ message: 'ignored', variant: ToastTypes.info });

		expect(notifications).toBe(0);
	});
});
