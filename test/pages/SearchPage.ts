import type { Browser } from 'webdriverio';
import { BasePage } from './Base';

export class SearchPage extends BasePage {
	private readonly input: string;
	private readonly root: string;
	private readonly retryButton: string;
	private readonly searchBar: string;

	constructor(driver: Browser) {
		super(driver);
		this.input = 'search-input';
		this.root = 'search-view';
		this.retryButton = 'search-retry';
		this.searchBar = 'search-bar';
	}

	async waitForLoad(): Promise<void> {
		await this.elementByID(this.root).waitForDisplayed();
		await this.elementByID(this.searchBar).waitForDisplayed();
		await this.elementByID(this.input).waitForDisplayed();
	}

	async isVisible(): Promise<boolean> {
		const root = this.elementByID(this.root);
		if (!(await root.isExisting())) {
			return false;
		}

		return await root.isDisplayed();
	}

	async enterSearchQuery(query: string): Promise<void> {
		await this.elementByID(this.input).waitForDisplayed();
		await this.elementByID(this.input).click();
		await this.elementByID(this.input).setValue(query);
	}

	async tapRetry(): Promise<void> {
		await this.elementByID(this.retryButton).waitForDisplayed();
		await this.elementByID(this.retryButton).click();
	}
}
