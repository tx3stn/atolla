import { getCapabilities, Platforms } from './utils/device';

export const config = {
	capabilities: getCapabilities(Platforms.Android),
	connectionRetryCount: 3,
	connectionRetryTimeout: 120_000,
	exclude: [],
	framework: 'mocha',
	logLevel: 'warn',
	maxInstances: 1,
	reporters: ['spec'],
	runner: 'local',
	services: [['appium', { args: { logLevel: 'warn' } }]],
	specs: ['./**/*.test.ts'],
	waitforTimeout: 10_000,
};
