import { getAllCapabilities } from './utils/device';
import { afterTestHook, beforeHook } from './utils/hooks';

export const config = {
	afterTest: afterTestHook,
	before: beforeHook,
	capabilities: getAllCapabilities(),
	connectionRetryCount: 3,
	connectionRetryTimeout: 300_000,
	exclude: [],
	framework: 'mocha',
	logLevel: 'warn',
	// 2 = one session per platform running simultaneously
	maxInstances: 2,
	maxInstancesPerCapability: 1,
	mochaOpts: {
		bail: 0,
		timeout: 120_000,
	},
	reporters: ['spec'],
	runner: 'local',
	services: ['appium'],
	specs: ['./**/*.test.ts'],
	waitforTimeout: 10_000,
};
