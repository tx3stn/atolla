import { ConnectionPage } from '../pages/ConnectionPage';
import { ConnectivityFabPage } from '../pages/ConnectivityFabPage';
import { FooterPage } from '../pages/Footer';
import { HomePage } from '../pages/HomePage';

async function ensureMockMode(): Promise<void> {
	const connectionPage = new ConnectionPage(browser);
	const footer = new FooterPage(browser);

	// Wait for bootstrap: either the connection view or the main app footer must appear
	await browser.waitUntil(
		async () => (await connectionPage.isVisible()) || (await footer.isVisible()),
		{ timeout: 30_000, timeoutMsg: 'App did not finish bootstrapping' },
	);

	// Case 1: app launched to connection view (first install or logged out)
	if (await connectionPage.isVisible()) {
		await connectionPage.connectToMock();
		return;
	}
	//
	// Offline mode — tap connectivity FAB and connect to mock
	const connectivityFab = new ConnectivityFabPage(browser);
	await connectivityFab.tap();
	await connectionPage.connectToMock();

	// Navigate to home and check whether mock data loads within a short timeout
	await footer.tapHome();
	const homePage = new HomePage(browser);
	if (await homePage.hasAlbumCards()) {
		return; // Already in mock/online mode
	}
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
