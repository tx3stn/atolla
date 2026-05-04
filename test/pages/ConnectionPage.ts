import type { Browser } from 'webdriverio';
import { BasePage } from './Base';

export class ConnectionPage extends BasePage {
	private readonly serverUrlInput = 'connection-server-url-input';
	private readonly connectButton = 'connection-connect-btn';
	private readonly footer = 'footer-home';

	constructor(driver: Browser) {
		super(driver);
	}

	async isVisible(): Promise<boolean> {
		const el = this.elementByID(this.serverUrlInput);
		if (!(await el.isExisting())) {
			return false;
		}

		return await el.isDisplayed();
	}

	async waitForLoad(): Promise<void> {
		await this.elementByID(this.serverUrlInput).waitForDisplayed({
			timeoutMsg: 'Timed out waiting for connection view',
		});
	}

	async connectToMock(): Promise<void> {
		await this.elementByID(this.serverUrlInput).waitForDisplayed();
		await this.elementByID(this.serverUrlInput).setValue('mock');
		await this.elementByID(this.connectButton).waitForDisplayed();
		await this.elementByID(this.connectButton).click();
		// Wait for the main app footer to confirm we're in
		await this.elementByID(this.footer).waitForDisplayed({
			timeout: 30_000,
			timeoutMsg: 'App did not load main UI after mock connection',
		});
	}
}
