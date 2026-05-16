import { ConnectionPage } from '../pages/ConnectionPage';
import { ConnectivityFabPage } from '../pages/ConnectivityFabPage';
import { FooterPage } from '../pages/Footer';
import { HomePage } from '../pages/HomePage';

async function ensureMockMode(): Promise<void> {
	const connectionPage = new ConnectionPage(browser);
	const footer = new FooterPage(browser);
	const connectivityFab = new ConnectivityFabPage(browser);

	await browser.waitUntil(
		async () =>
			(await connectionPage.isVisible()) ||
			(await footer.isVisible()) ||
			(await connectivityFab.isVisible()),
		{ timeout: 30_000, timeoutMsg: 'App did not finish bootstrapping' },
	);

	if (await connectionPage.isVisible()) {
		await connectionPage.connectToMock();
	} else {
		await connectivityFab.tap();
		await connectionPage.connectToMock();
	}

	await footer.tapHome();
	await new HomePage(browser).waitForAlbumCards();
}

export async function beforeHook(): Promise<void> {
	const isIOS = (browser.capabilities.platformName as string).toLowerCase() === 'ios';

	const appId = isIOS
		? (process.env.E2E_BUNDLE_ID ?? 'com.tx3stn.atolla')
		: ((await browser.execute('mobile: getCurrentPackage')) as string);

	const appStateParam = isIOS ? { bundleId: appId } : { appId };
	const state = (await browser.execute('mobile: queryAppState', appStateParam)) as number;
	if (state > 1) {
		try {
			await browser.terminateApp(appId);
		} catch {
			// Best effort cleanup: on highly parallel iOS startup WDA can restart.
		}
	}

	// On Android the emulator network stack may not be ready immediately after boot.
	// Wait for wifi or data before launching so the app doesn't start in offline mode.
	if (!isIOS) {
		await browser.waitUntil(
			async () => {
				try {
					const connectivity = (await browser.execute('mobile: getConnectivity', {
						services: ['wifi', 'data'],
					})) as { data?: unknown; wifi?: unknown };
					return connectivity.wifi === true || connectivity.data === true;
				} catch {
					return true;
				}
			},
			{ timeout: 30_000, timeoutMsg: 'Network not ready before app launch' },
		);
	}

	try {
		await browser.activateApp(appId);
	} catch {
		// WDA may have restarted; pause briefly and retry once
		await browser.pause(2000);
		await browser.activateApp(appId);
	}
	await ensureMockMode();
}

export async function afterTestHook(
	_test: unknown,
	_context: unknown,
	{ error }: { error?: Error },
): Promise<void> {
	if (error) {
		try {
			await browser.takeScreenshot();
		} catch {
			// session may already be broken; screenshot is best-effort
		}
	}
}
