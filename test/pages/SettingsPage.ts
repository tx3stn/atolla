import type { Browser } from 'webdriverio';

export class SettingsPage {
	constructor(private readonly driver: Browser) {}

	private readonly selectors = {
		clearCacheButton: '~settings-cache-clear-btn',
	};

	async waitForLoad(): Promise<void> {
		await this.driver.$(this.selectors.clearCacheButton).waitForExist();
	}

	async isVisible(): Promise<boolean> {
		return await this.driver.$(this.selectors.clearCacheButton).isExisting();
	}
}
