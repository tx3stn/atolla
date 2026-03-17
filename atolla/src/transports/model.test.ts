import { describe, expect, it } from 'bun:test';
import { ConnectionModes, cycleConnectionMode } from './model';

describe('cycleConnectionMode', () => {
	it('should cycle through connection modes', () => {
		let mode = cycleConnectionMode(ConnectionModes.mock);
		expect(mode).toBe(ConnectionModes.online);

		mode = cycleConnectionMode(mode);
		expect(mode).toBe(ConnectionModes.offline);

		mode = cycleConnectionMode(mode);
		expect(mode).toBe(ConnectionModes.mock);
	});
});
