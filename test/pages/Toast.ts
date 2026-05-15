import { BasePage } from './Base';

export class Toast extends BasePage {
	private readonly root = 'toast';

	isVisible(): Promise<boolean> {
		return this.elementByID(this.root).isExisting();
	}

	async waitForVisible(): Promise<void> {
		await this.elementByID(this.root).waitForDisplayed({
			timeoutMsg: 'Timed out waiting for toast to appear',
		});
	}

	async waitForHidden(): Promise<void> {
		await this.driver.waitUntil(async () => !(await this.elementByID(this.root).isExisting()), {
			timeoutMsg: 'Timed out waiting for toast to dismiss',
		});
	}
}
