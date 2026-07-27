import { ConnectionPage } from '../../pages/ConnectionPage';
import { FooterPage } from '../../pages/Footer';
import { SettingsPage } from '../../pages/SettingsPage';
import { Toast } from '../../pages/Toast';
import { connectToServer, mockServerUrl } from '../../utils/hooks';

describe('settings', () => {
	let footer: FooterPage;
	let settingsPage: SettingsPage;

	beforeEach(async () => {
		footer = new FooterPage(browser);
		settingsPage = new SettingsPage(browser);

		await footer.tapSettings();
		await settingsPage.waitForLoad();
	});

	afterEach(async () => {
		// the logout test leaves the app on the connection view; reconnect here (not inline) so a
		// slow post-logout render can't strand the next test's session. the full connect flow
		// handles the http warning + quick connect a bare page-level connect would skip
		const connectionPage = new ConnectionPage(browser);
		if (await connectionPage.isVisible()) {
			await connectToServer(mockServerUrl());
		}
	});

	it('shows settings view when tapping the settings tab', async () => {
		expect(await settingsPage.isVisible()).toBe(true);
	});

	it('shows a toast after clearing the cache', async () => {
		const toast = new Toast(browser);

		await settingsPage.tapClearCache();
		await toast.waitForVisible();
		await toast.waitForHidden();
	});

	it('shows connection view after logging out', async () => {
		const connectionPage = new ConnectionPage(browser);

		await settingsPage.tapLogout();
		await connectionPage.waitForLoad();

		expect(await connectionPage.isVisible()).toBe(true);
	});

	it('shows settings view after navigating away and back', async () => {
		await footer.tapLibrary();
		await footer.tapSettings();
		await settingsPage.waitForLoad();

		expect(await settingsPage.isVisible()).toBe(true);
	});
});
