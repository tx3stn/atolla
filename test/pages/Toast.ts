import type { Browser } from 'webdriverio';
import { BasePage } from './Base';

export class Toast extends BasePage {
	private readonly root: string;

	constructor(driver: Browser) {
		super(driver);

		this.root = 'toast';
	}

	async isVisible(): Promise<boolean> {
		const el = this.elementByID(this.root);
		if (!(await el.isExisting())) {
			return false;
		}

		return await el.isDisplayed();
	}

	async waitForVisible(): Promise<void> {
		await this.elementByID(this.root).waitForDisplayed({
			timeoutMsg: 'Timed out waiting for toast to appear',
		});
	}

	async waitForHidden(): Promise<void> {
		await this.driver.waitUntil(
			async () => {
				const el = this.elementByID(this.root);
				if (!(await el.isExisting())) {
					return true;
				}

				return !(await el.isDisplayed());
			},
			{ timeoutMsg: 'Timed out waiting for toast to dismiss' },
		);
	}
}
