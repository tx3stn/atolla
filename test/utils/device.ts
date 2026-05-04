import { realpathSync } from 'node:fs';

export const Platforms = {
	Android: 'Android',
	iOS: 'iOS',
};

export type Platform = (typeof Platforms)[keyof typeof Platforms];

interface DeviceConfig {
	appActivity?: string;
	appPackage?: string;
	automationName: string;
	avd?: string;
	bundleId?: string;
	deviceName: string;
	newCommandTimeout: number;
	platformName: Platform;
	platformVersion: string;
}

export function getDeviceConfig(device: Platform): DeviceConfig {
	switch (device) {
		case Platforms.iOS: {
			return {
				automationName: 'XCUITest',
				bundleId: process.env.E2E_BUNDLE_ID ?? 'com.tx3stn.atolla',
				deviceName: process.env.E2E_DEVICE_NAME ?? 'iPhone 17',
				newCommandTimeout: 240,
				platformName: 'iOS',
				platformVersion: process.env.E2E_PLATFORM_VERSION ?? '26.4',
			};
		}

		default: {
			const deviceName = process.env.E2E_DEVICE_NAME ?? 'gsd-api34';
			return {
				automationName: 'UiAutomator2',
				avd: deviceName,
				deviceName,
				newCommandTimeout: 240,
				platformName: 'Android',
				platformVersion: process.env.E2E_PLATFORM_VERSION ?? '14',
			};
		}
	}
}

function resolveAppPath(appPath: string | undefined): string | undefined {
	if (!appPath) return undefined;
	try {
		return realpathSync(appPath);
	} catch {
		return appPath;
	}
}

function buildCapability(cfg: DeviceConfig, appPath: string | undefined) {
	const resolvedPath = resolveAppPath(appPath);
	return {
		...(resolvedPath && { 'appium:app': resolvedPath }),
		'appium:automationName': cfg.automationName,
		'appium:deviceName': cfg.deviceName,
		'appium:platformVersion': cfg.platformVersion,
		platformName: cfg.platformName,
		...(cfg.avd && {
			'appium:avd': cfg.avd,
			'appium:avdLaunchTimeout': 180_000,
		}),
		...(cfg.bundleId && { 'appium:bundleId': cfg.bundleId }),
		'appium:fullReset': false,
		'appium:newCommandTimeout': cfg.newCommandTimeout,
		'appium:noReset': false,
	};
}

export function getCapabilities(device: Platform) {
	return [buildCapability(getDeviceConfig(device), process.env.E2E_APP_PATH)];
}

export function getAllCapabilities() {
	return [
		buildCapability(getDeviceConfig(Platforms.Android), process.env.E2E_ANDROID_APP_PATH),
		buildCapability(getDeviceConfig(Platforms.iOS), process.env.E2E_IOS_APP_PATH),
	];
}
