import { BasePage } from './Base';
import { HTTPWarningModal } from './HTTPWarningModal';

export class ConnectionPage extends BasePage {
	private readonly connectButton = 'connection-connect-btn';
	private readonly quickConnect = 'connection-quick-connect-code';
	private readonly serverUrlInput = 'connection-server-url-input';

	HTTPWarningModal(): HTTPWarningModal {
		return new HTTPWarningModal(this.driver);
	}

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

	async connectToServer(serverURL: string): Promise<void> {
		const input = this.elementByID(this.serverUrlInput);
		await input.waitForDisplayed();
		await input.setValue(serverURL);
		const connectBtn = this.elementByID(this.connectButton);
		await connectBtn.waitForDisplayed();
		await connectBtn.click();
	}

	async quickConnectCodeIsVisible(): Promise<boolean> {
		return await this.elementByID(this.quickConnect).isDisplayed();
	}
}
