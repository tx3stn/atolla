import type { Browser } from 'webdriverio';
import { BasePage } from './Base';

export class SettingsPage extends BasePage {
	private readonly clearCacheButton: string;

	constructor(driver: Browser) {
		super(driver);
		this.clearCacheButton = 'settings-cache-clear-btn';
	}

	async waitForLoad(): Promise<void> {
		await this.elementByID(this.clearCacheButton).waitForDisplayed();
	}

	async isVisible(): Promise<boolean> {
		return await this.elementByID(this.clearCacheButton).isDisplayed();
	}
}
