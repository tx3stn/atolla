import { getCapabilities, Platforms } from './utils/device';

export const config = {
	before: async () => {
		const packageName = (await browser.execute('mobile: getCurrentPackage')) as string;
		const state = (await browser.execute('mobile: queryAppState', {
			appId: packageName,
		})) as number;
		if (state > 1) {
			await browser.terminateApp(packageName);
		}

		await browser.activateApp(packageName);
	},
	capabilities: getCapabilities(Platforms.Android),
	connectionRetryCount: 3,
	connectionRetryTimeout: 120_000,
	exclude: [],
	framework: 'mocha',
	logLevel: 'warn',
	maxInstances: 1,
	maxInstancesPerCapability: 1,
	reporters: ['spec'],
	runner: 'local',
	services: ['appium'],
	specs: ['./**/*.test.ts'],
	waitforTimeout: 10_000,
};
