import type { Browser } from 'webdriverio';
import { BasePage } from './Base';

export class SearchPage extends BasePage {
	private readonly searchBar: string;

	constructor(driver: Browser) {
		super(driver);
		this.searchBar = 'search-bar';
	}

	async waitForLoad(): Promise<void> {
		await this.elementByID(this.searchBar).waitForDisplayed();
	}

	async isVisible(): Promise<boolean> {
		return await this.elementByID(this.searchBar).isDisplayed();
	}
}
