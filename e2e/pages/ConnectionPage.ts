import { BasePage } from './Base';

export class ConnectionPage extends BasePage {
	private readonly serverUrlInput = 'connection-server-url-input';
	private readonly connectButton = 'connection-connect-btn';
	private readonly footer = 'footer-home';

	async isVisible(): Promise<boolean> {
		const el = this.elementByID(this.serverUrlInput);
		if (!(await el.isExisting())) return false;
		return el.isDisplayed();
	}

	async waitForLoad(): Promise<void> {
		await this.elementByID(this.serverUrlInput).waitForDisplayed({
			timeoutMsg: 'Timed out waiting for connection view',
		});
	}

	async connectToMock(): Promise<void> {
		const input = this.elementByID(this.serverUrlInput);
		await input.waitForDisplayed();
		await input.setValue('mock');
		const connectBtn = this.elementByID(this.connectButton);
		await connectBtn.waitForDisplayed();
		await connectBtn.click();
		await this.elementByID(this.footer).waitForDisplayed({
			timeout: 30_000,
			timeoutMsg: 'App did not load main UI after mock connection',
		});
	}
}
