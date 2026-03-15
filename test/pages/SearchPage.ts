import type { Browser } from 'webdriverio';

export class SearchPage {
	constructor(private readonly driver: Browser) {}

	private readonly selectors = {
		searchBar: '~search-bar',
	};

	async waitForLoad(): Promise<void> {
		const element = this.driver.$(this.selectors.searchBar);
		await element.waitForExist({ timeout: 15_000 });
	}

	async isVisisble(): Promise<boolean> {
		const element = this.driver.$(this.selectors.searchBar);
		return await element.isExisting();
	}
}
