import { describe, expect, it } from 'bun:test';
import { ConnectionModes } from '../transports/Model';
import { SessionController, type SessionHandle } from './SessionController';

function makeHandle(overrides: Partial<SessionHandle> = {}): SessionHandle {
	return {
		applyDeviceIdOverride: () => {},
		defaultDeviceId: () => '',
		logout: () => {},
		requestModeChange: () => Promise.resolve(true),
		serverName: () => '',
		serverUrl: () => '',
		...overrides,
	};
}

describe('SessionController', () => {
	it('forwards logout to the registered handle', () => {
		const controller = new SessionController();
		let loggedOut = false;
		controller.register(
			makeHandle({
				logout: () => {
					loggedOut = true;
				},
			}),
		);

		controller.logout();

		expect(loggedOut).toBe(true);
	});

	it('forwards requestModeChange and returns the handle result', async () => {
		const controller = new SessionController();
		const modes: Array<string> = [];
		controller.register(
			makeHandle({
				requestModeChange: (mode) => {
					modes.push(mode);
					return Promise.resolve(true);
				},
			}),
		);

		const result = await controller.requestModeChange(ConnectionModes.online);

		expect(modes).toEqual([ConnectionModes.online]);
		expect(result).toBe(true);
	});

	it('forwards applyDeviceIdOverride to the handle', () => {
		const controller = new SessionController();
		let applied = '';
		controller.register(
			makeHandle({
				applyDeviceIdOverride: (value) => {
					applied = value;
				},
			}),
		);

		controller.applyDeviceIdOverride('device-x');

		expect(applied).toBe('device-x');
	});

	it('exposes server and device info from the handle', () => {
		const controller = new SessionController();
		controller.register(
			makeHandle({
				defaultDeviceId: () => 'dev-1',
				serverName: () => 'Home',
				serverUrl: () => 'https://server',
			}),
		);

		expect(controller.serverName()).toBe('Home');
		expect(controller.serverUrl()).toBe('https://server');
		expect(controller.defaultDeviceId()).toBe('dev-1');
	});

	it('returns safe defaults when nothing is registered', async () => {
		const controller = new SessionController();

		expect(() => controller.logout()).not.toThrow();
		expect(() => controller.applyDeviceIdOverride('x')).not.toThrow();
		expect(await controller.requestModeChange(ConnectionModes.offline)).toBe(false);
		expect(controller.serverName()).toBe('');
		expect(controller.serverUrl()).toBe('');
		expect(controller.defaultDeviceId()).toBe('');
	});

	it('clears the handle when registered with null', () => {
		const controller = new SessionController();
		let loggedOut = false;
		controller.register(
			makeHandle({
				logout: () => {
					loggedOut = true;
				},
			}),
		);
		controller.register(null);

		controller.logout();

		expect(loggedOut).toBe(false);
	});
});
