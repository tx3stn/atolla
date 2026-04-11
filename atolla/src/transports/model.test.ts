import { describe, expect, it } from 'bun:test';
import { ConnectionModes, cycleConnectionMode } from './Model';

describe('cycleConnectionMode', () => {
	it('should cycle through connection modes', () => {
		let mode = cycleConnectionMode(ConnectionModes.online);
		expect(mode).toBe(ConnectionModes.offline);

		mode = cycleConnectionMode(mode);
		expect(mode).toBe(ConnectionModes.online);
	});

	it('should not switch when in mock mode', () => {
		const mode = cycleConnectionMode(ConnectionModes.mock);
		expect(mode).toBe(ConnectionModes.mock);
	});
});
