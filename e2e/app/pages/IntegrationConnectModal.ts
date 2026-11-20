import { BasePage } from './Base';

export class IntegrationConnectModal extends BasePage {
	private readonly root = 'integration-connect-modal';
	private readonly urlInput = 'integration-url-input';
	private readonly apiKeyInput = 'integration-api-key-input';
	private readonly authenticateButton = 'integration-authenticate-btn';
	private readonly cancelButton = 'integration-cancel-btn';

	isOpen(timeout = 2_000): Promise<boolean> {
		return this.elementByID(this.root)
			.waitForDisplayed({ timeout })
			.then(
				() => true,
				() => false,
			);
	}

	async waitForVisible(): Promise<void> {
		await this.elementByID(this.root).waitForDisplayed({
			timeoutMsg: 'Integration connect modal not visible',
		});
	}

	async waitForHidden(timeout = 20_000): Promise<void> {
		await this.driver.waitUntil(async () => !(await this.elementByID(this.root).isExisting()), {
			timeout,
			timeoutMsg: 'Integration connect modal did not dismiss',
		});
	}

	async enterUrl(url: string): Promise<void> {
		await this.typeInto(this.urlInput, url, 'server address input');
	}

	async enterApiKey(apiKey: string): Promise<void> {
		await this.typeInto(this.apiKeyInput, apiKey, 'API key input');
	}

	async tapAuthenticate(): Promise<void> {
		const el = this.elementByID(this.authenticateButton);
		await el.waitForDisplayed({ timeoutMsg: 'Timed out waiting for authenticate button' });
		await el.click();
	}

	async tapCancel(): Promise<void> {
		const el = this.elementByID(this.cancelButton);
		await el.waitForDisplayed({ timeoutMsg: 'Timed out waiting for cancel button' });
		await el.click();
	}

	private async typeInto(id: string, text: string, label: string): Promise<void> {
		const input = this.elementByID(id);
		await input.waitForDisplayed({ timeoutMsg: `Timed out waiting for ${label}` });
		await input.click();
		if (this.isAndroid()) {
			// mobile: type fires onChange, unlike setValue which bypasses the listener
			await input.clearValue();
			await this.driver.execute('mobile: type', { text });
		} else {
			await input.setValue(text);
		}
	}
}
