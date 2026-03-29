import type { Browser } from 'webdriverio';
import { BasePage } from './Base';

export class Toast extends BasePage {
	private readonly root: string;

	constructor(driver: Browser) {
		super(driver);

		this.root = 'toast';
	}

	async isVisible(): Promise<boolean> {
		return await this.elementByID(this.root).isDisplayed();
	}
}
