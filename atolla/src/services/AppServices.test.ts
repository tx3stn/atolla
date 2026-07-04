import { describe, expect, it } from 'bun:test';
import { ConnectionModes } from '../transports/Model';
import { AppServices, type AppServicesBag } from './AppServices';

const stub = {} as unknown;

function makeBag(overrides: Partial<AppServicesBag> = {}): AppServicesBag {
	return {
		barColors: stub as AppServicesBag['barColors'],
		connectionMode: ConnectionModes.online,
		downloadingCount: 0,
		downloadService: stub as AppServicesBag['downloadService'],
		imageCache: stub as AppServicesBag['imageCache'],
		modalSlot: stub as AppServicesBag['modalSlot'],
		onRequestModeChange: async () => true,
		paletteQueue: stub as AppServicesBag['paletteQueue'],
		paletteService: stub as AppServicesBag['paletteService'],
		playbackOrchestrator: stub as AppServicesBag['playbackOrchestrator'],
		playbackStore: stub as AppServicesBag['playbackStore'],
		preferences: stub as AppServicesBag['preferences'],
		toastService: stub as AppServicesBag['toastService'],
		toastSlot: stub as AppServicesBag['toastSlot'],
		transport: stub as AppServicesBag['transport'],
		...overrides,
	};
}

describe('AppServices', () => {
	it('is not ready until a bag is set', () => {
		const services = new AppServices();
		expect(services.ready).toBe(false);
		services.set(makeBag());
		expect(services.ready).toBe(true);
	});

	it('exposes the current bag via get', () => {
		const services = new AppServices();
		const bag = makeBag();
		services.set(bag);
		expect(services.get()).toBe(bag);
	});

	it('clear drops the bag and flips ready back to false', () => {
		const services = new AppServices();
		services.set(makeBag());
		services.clear();
		expect(services.ready).toBe(false);
		expect(services.get()).toBeUndefined();
	});

	it('notifies subscribers on first set', () => {
		const services = new AppServices();
		let calls = 0;
		services.subscribe(() => {
			calls += 1;
		});
		services.set(makeBag());
		expect(calls).toBe(1);
	});

	it('notifies when a reactive scalar changes', () => {
		const services = new AppServices();
		services.set(makeBag({ downloadingCount: 0 }));
		let calls = 0;
		services.subscribe(() => {
			calls += 1;
		});
		services.set(makeBag({ downloadingCount: 1 }));
		expect(calls).toBe(1);
	});

	it('does not notify when nothing meaningful changed', () => {
		const services = new AppServices();
		services.set(makeBag());
		let calls = 0;
		services.subscribe(() => {
			calls += 1;
		});
		services.set(makeBag());
		expect(calls).toBe(0);
	});

	it('clear notifies once and is a no-op when already clear', () => {
		const services = new AppServices();
		services.set(makeBag());
		let calls = 0;
		services.subscribe(() => {
			calls += 1;
		});
		services.clear();
		services.clear();
		expect(calls).toBe(1);
	});

	it('stops notifying after the subscription is disposed', () => {
		const services = new AppServices();
		let calls = 0;
		const dispose = services.subscribe(() => {
			calls += 1;
		});
		dispose();
		services.set(makeBag());
		expect(calls).toBe(0);
	});
});
