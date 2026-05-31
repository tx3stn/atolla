import { getCapabilities, Platforms } from './utils/device';
import {
	afterHookHook,
	afterTestHook,
	beforeHook,
	beforeSuiteHook,
	beforeTestHook,
	onCompleteHook,
} from './utils/hooks';

const platform = process.env.E2E_PLATFORM === 'iOS' ? Platforms.iOS : Platforms.Android;

export const config = {
	afterHook: afterHookHook,
	afterTest: afterTestHook,
	before: beforeHook,
	beforeSuite: beforeSuiteHook,
	beforeTest: beforeTestHook,
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
	onComplete: onCompleteHook,
	reporters: ['spec'],
	runner: 'local',
	services: ['appium'],
	specs: ['./tests/**/*.test.ts'],
	waitforTimeout: 10_000,
};
