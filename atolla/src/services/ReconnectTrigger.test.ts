import { describe, expect, it } from 'bun:test';
import { ConnectionModes } from '../transports/Model';
import { shouldTriggerReconnectSync } from './ReconnectTrigger';

describe('shouldTriggerReconnectSync', () => {
	const base = {
		inFlight: false,
		mode: ConnectionModes.online,
		reachable: true,
		wasReachable: false,
	};

	it('triggers on an offline->online network transition while online', () => {
		expect(shouldTriggerReconnectSync(base)).toBe(true);
	});

	it('does not trigger when already reachable (no transition)', () => {
		expect(shouldTriggerReconnectSync({ ...base, wasReachable: true })).toBe(false);
	});

	it('does not trigger in offline mode', () => {
		expect(shouldTriggerReconnectSync({ ...base, mode: ConnectionModes.offline })).toBe(false);
	});

	it('does not trigger in mock mode', () => {
		expect(shouldTriggerReconnectSync({ ...base, mode: ConnectionModes.mock })).toBe(false);
	});

	it('does not trigger while a sync is already in flight', () => {
		expect(shouldTriggerReconnectSync({ ...base, inFlight: true })).toBe(false);
	});

	it('does not trigger when the network is unreachable', () => {
		expect(shouldTriggerReconnectSync({ ...base, reachable: false })).toBe(false);
	});
});
