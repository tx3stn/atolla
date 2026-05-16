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
	index: number;
	mjpegServerPort?: number;
	newCommandTimeout: number;
	platformName: Platform;
	platformVersion: string;
	systemPort?: number;
	udid?: string;
	wdaLocalPort?: number;
}

const ANDROID_SYSTEM_PORT_BASE = 8200;
const IOS_WDA_PORT_BASE = 8100;
const IOS_MJPEG_PORT_BASE = 9100;

function parseList(value: string | undefined): Array<string> {
	if (!value) return [];
	return value
		.split(',')
		.map((item) => item.trim())
		.filter(Boolean);
}

function parseCount(value: string | undefined): number {
	const parsed = Number.parseInt(value ?? '', 10);
	if (Number.isNaN(parsed) || parsed < 1) return 0;
	return parsed;
}

export function getDeviceConfig(device: Platform, index = 0): DeviceConfig {
	switch (device) {
		case Platforms.iOS: {
			const iosDevices = parseList(process.env.E2E_IOS_DEVICE_NAMES);
			const iosUdids = parseList(process.env.E2E_IOS_UDIDS);
			const deviceName = iosDevices[index] ?? process.env.E2E_DEVICE_NAME ?? 'iPhone 17';
			return {
				automationName: 'XCUITest',
				bundleId: process.env.E2E_BUNDLE_ID ?? 'com.tx3stn.atolla',
				deviceName,
				index,
				mjpegServerPort: IOS_MJPEG_PORT_BASE + index,
				newCommandTimeout: 240,
				platformName: 'iOS',
				platformVersion: process.env.E2E_PLATFORM_VERSION ?? '26.4',
				udid: iosUdids[index],
				wdaLocalPort: IOS_WDA_PORT_BASE + index,
			};
		}

		default: {
			const androidDevices = parseList(process.env.E2E_ANDROID_DEVICE_NAMES);
			const androidSerials = parseList(process.env.E2E_ANDROID_SERIALS);
			const serial = androidSerials[index];
			const deviceName = androidDevices[index] ?? process.env.E2E_DEVICE_NAME ?? 'gsd-api34';
			return {
				automationName: 'UiAutomator2',
				// When targeting a specific running emulator by serial, don't set avd
				// (avd tells Appium to boot the emulator; serial means it's already running).
				...(serial ? {} : { avd: deviceName }),
				deviceName,
				index,
				newCommandTimeout: 240,
				platformName: 'Android',
				platformVersion: process.env.E2E_PLATFORM_VERSION ?? '14',
				systemPort: ANDROID_SYSTEM_PORT_BASE + index,
				...(serial ? { udid: serial } : {}),
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
		...(cfg.mjpegServerPort && { 'appium:mjpegServerPort': cfg.mjpegServerPort }),
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
		...(cfg.systemPort && { 'appium:systemPort': cfg.systemPort }),
		...(cfg.udid && { 'appium:udid': cfg.udid }),
		...(cfg.wdaLocalPort && { 'appium:wdaLocalPort': cfg.wdaLocalPort }),
	};
}

export function getCapabilities(device: Platform) {
	return [buildCapability(getDeviceConfig(device), process.env.E2E_APP_PATH)];
}

export function getAndroidCapabilities() {
	const androidDevices = parseList(process.env.E2E_ANDROID_DEVICE_NAMES);
	const androidSerials = parseList(process.env.E2E_ANDROID_SERIALS);
	const androidInstances = parseCount(process.env.E2E_ANDROID_INSTANCES);
	const count = Math.max(androidDevices.length, androidSerials.length, androidInstances, 1);
	return Array.from({ length: count }, (_, index) =>
		buildCapability(getDeviceConfig(Platforms.Android, index), process.env.E2E_ANDROID_APP_PATH),
	);
}

export function getIOSCapabilities() {
	const iosDevices = parseList(process.env.E2E_IOS_DEVICE_NAMES);
	const iosUdids = parseList(process.env.E2E_IOS_UDIDS);
	const iosInstances = parseCount(process.env.E2E_IOS_INSTANCES);
	const count = Math.max(iosDevices.length, iosUdids.length, iosInstances, 1);
	return Array.from({ length: count }, (_, index) =>
		buildCapability(getDeviceConfig(Platforms.iOS, index), process.env.E2E_IOS_APP_PATH),
	);
}

export function getAllCapabilities() {
	return [...getAndroidCapabilities(), ...getIOSCapabilities()];
}
