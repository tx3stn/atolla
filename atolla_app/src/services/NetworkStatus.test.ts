import { describe, expect, it } from 'bun:test';
import { type NetworkReachabilitySource, NetworkStatus, parseNetworkStatus } from './NetworkStatus';

function fakeSource(
	initial: string,
): NetworkReachabilitySource & { emit(json: string): void; observerCount(): number } {
	let json = initial;
	const listeners = new Set<() => void>();
	return {
		emit(next: string) {
			json = next;
			for (const listener of listeners) listener();
		},
		getStatusJson: () => json,
		observe(onChange) {
			listeners.add(onChange);
			return () => {
				listeners.delete(onChange);
			};
		},
		observerCount: () => listeners.size,
	};
}

describe('parseNetworkStatus', () => {
	it('reads reachable + transport from the native blob', () => {
		expect(parseNetworkStatus('{"reachable":true,"transport":"wifi"}')).toEqual({
			reachable: true,
			transport: 'wifi',
		});
		expect(parseNetworkStatus('{"reachable":true,"transport":"cellular"}')).toEqual({
			reachable: true,
			transport: 'cellular',
		});
	});

	it('treats reachable:false as offline', () => {
		expect(parseNetworkStatus('{"reachable":false,"transport":"none"}')).toEqual({
			reachable: false,
			transport: 'none',
		});
	});

	it('assumes online when the native module is absent or the blob is unparseable', () => {
		expect(parseNetworkStatus('')).toEqual({ reachable: true, transport: 'none' });
		expect(parseNetworkStatus('not json')).toEqual({ reachable: true, transport: 'none' });
	});

	it('falls back to none for an unknown transport', () => {
		expect(parseNetworkStatus('{"reachable":true,"transport":"satellite"}')).toEqual({
			reachable: true,
			transport: 'none',
		});
	});
});

describe('NetworkStatus', () => {
	it('reports reachability and transport from the native getter', () => {
		const status = new NetworkStatus(fakeSource('{"reachable":true,"transport":"cellular"}'));
		expect(status.isReachable()).toBe(true);
		expect(status.getTransport()).toBe('cellular');
	});

	it('reads fresh on every call so a missed observer can not go stale', () => {
		const source = fakeSource('{"reachable":true,"transport":"wifi"}');
		const status = new NetworkStatus(source);
		expect(status.isReachable()).toBe(true);

		// value changes but no observer fires
		source.getStatusJson = () => '{"reachable":false,"transport":"none"}';
		expect(status.isReachable()).toBe(false);
	});

	it('notifies subscribers when the native observer fires', () => {
		const source = fakeSource('{"reachable":false,"transport":"none"}');
		const status = new NetworkStatus(source);
		let notifications = 0;
		status.subscribe(() => (notifications += 1));

		source.emit('{"reachable":true,"transport":"wifi"}');
		expect(notifications).toBe(1);
		expect(status.isReachable()).toBe(true);
	});

	it('unsubscribes and stops observing on dispose', () => {
		const source = fakeSource('{"reachable":true,"transport":"wifi"}');
		const status = new NetworkStatus(source);
		let notifications = 0;
		status.subscribe(() => (notifications += 1));

		status.dispose();
		expect(source.observerCount()).toBe(0);

		source.emit('{"reachable":false,"transport":"none"}');
		expect(notifications).toBe(0);
	});
});
