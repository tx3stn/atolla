async function ensureMockMode(): Promise<void> {
	const connectionInput = browser.$('~connection-server-url-input');
	if (!(await connectionInput.isExisting())) {
		return;
	}

	if (!(await connectionInput.isDisplayed())) {
		return;
	}

	await connectionInput.setValue('mock');
	await browser.$('~connection-connect-btn').waitForDisplayed();
	await browser.$('~connection-connect-btn').click();
	await browser.$('~footer-home').waitForDisplayed({
		timeout: 30_000,
		timeoutMsg: 'App did not load main UI after mock connection',
	});
}

export async function beforeHook(): Promise<void> {
	const isIOS = (browser.capabilities.platformName as string).toLowerCase() === 'ios';

	// iOS exposes the bundle ID directly in capabilities; Android requires a mobile command
	const appId = isIOS
		? (browser.capabilities['appium:bundleId'] as string)
		: ((await browser.execute('mobile: getCurrentPackage')) as string);

	const state = (await browser.execute('mobile: queryAppState', { appId })) as number;
	if (state > 1) {
		await browser.terminateApp(appId);
	}

	// On Android the emulator network stack may not be ready immediately after boot.
	// Wait for wifi or data before launching so the app doesn't start in offline mode.
	if (!isIOS) {
		await browser.waitUntil(
			async () => {
				try {
					const connection = (await browser.getNetworkConnection()) as number;
					return (connection & 6) !== 0;
				} catch {
					return true;
				}
			},
			{ timeout: 30_000, timeoutMsg: 'Network not ready before app launch' },
		);
	}

	await browser.activateApp(appId);
	await ensureMockMode();
}

export async function afterTestHook(
	_test: unknown,
	_context: unknown,
	{ error }: { error?: Error },
): Promise<void> {
	if (error) {
		await browser.takeScreenshot();
	}
}
