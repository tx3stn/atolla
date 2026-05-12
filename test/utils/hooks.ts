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
	await new HomePage(browser).hasAlbumCards();
}

export async function beforeHook(): Promise<void> {
	const isIOS = (browser.capabilities.platformName as string).toLowerCase() === 'ios';

	const appId = isIOS
		? (process.env.E2E_BUNDLE_ID ?? 'com.tx3stn.atolla')
		: ((await browser.execute('mobile: getCurrentPackage')) as string);

	const appStateParam = isIOS ? { bundleId: appId } : { appId };
	const state = (await browser.execute('mobile: queryAppState', appStateParam)) as number;
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
