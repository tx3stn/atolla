import { getCapabilities, Platforms } from './utils/device';
import { afterHookHook, afterTestHook, beforeHook, onCompleteHook } from './utils/hooks';

const platform = process.env.E2E_PLATFORM === 'iOS' ? Platforms.iOS : Platforms.Android;

export const config = {
	afterHook: afterHookHook,
	afterTest: afterTestHook,
	before: beforeHook,
	onComplete: onCompleteHook,
	capabilities: getCapabilities(platform),
	connectionRetryCount: 3,
	connectionRetryTimeout: 300_000,
	exclude: [],
	framework: 'mocha',
	logLevel: 'warn',
	maxInstances: 1,
	maxInstancesPerCapability: 1,
	mochaOpts: {
		bail: 1,
		timeout: 120_000,
	},
	reporters: ['spec'],
	runner: 'local',
	services: ['appium'],
	specs: ['./**/*.test.ts'],
	waitforTimeout: 10_000,
};
