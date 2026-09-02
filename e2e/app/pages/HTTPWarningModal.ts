import { BasePage } from './Base';

export class HTTPWarningModal extends BasePage {
	private readonly confirmButton = 'http-warning-confirm-btn';

	async isVisible(): Promise<boolean> {
		return await this.elementByID(this.confirmButton).isDisplayed();
	}

	async tapConfirmButton(): Promise<void> {
		await this.elementByID(this.confirmButton).click();
	}

	async waitForDismissed(): Promise<void> {
		await this.driver.waitUntil(
			async () => !(await this.elementByID(this.confirmButton).isExisting()),
			{
				timeoutMsg: 'http warning modal did not dismiss',
			},
		);
	}
}
