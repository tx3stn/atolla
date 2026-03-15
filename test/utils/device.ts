export const Platforms = {
	Android: 'Android',
	iOS: 'iOS',
};

export type Platform = (typeof Platforms)[keyof typeof Platforms];

interface DeviceConfig {
	appActivity?: string;
	appPackage?: string;
	automationName: string;
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
				bundleId: 'com.apple.Preferences',
				deviceName: 'iPhone 15',
				newCommandTimeout: 240,
				platformName: 'iOS',
				platformVersion: '17.0',
			};
		}

		default: {
			return {
				automationName: 'UiAutomator2',
				deviceName: 'sdk_gphone64_arm64',
				// Session closes after 4 minutes of inactivity
				newCommandTimeout: 240,
				platformName: 'Android',
				platformVersion: '14',
			};
		}
	}
}

export function getCapabilities(device: Platform) {
	const cfg = getDeviceConfig(device);

	return [
		{
			'appium:app': process.env.E2E_APP_PATH,
			'appium:automationName': cfg.automationName,
			'appium:deviceName': cfg.deviceName,
			'appium:platformVersion': cfg.platformVersion,
			platformName: cfg.platformName,
			...(cfg.bundleId && { 'appium:bundleId': cfg.bundleId }),
			'appium:fullReset': false,
			'appium:newCommandTimeout': cfg.newCommandTimeout,
			'appium:noReset': false,
		},
	];
}
