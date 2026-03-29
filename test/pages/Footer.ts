import type { Browser } from 'webdriverio';
import { BasePage } from './Base';

export class FooterPage extends BasePage {
	private readonly home: string;
	private readonly searchBar: string;
	private readonly search: string;
	private readonly settings: string;

	constructor(driver: Browser) {
		super(driver);

		this.home = 'footer-home';
		this.searchBar = 'search-bar';
		this.search = 'footer-search';
		this.settings = 'footer-settings';
	}

	async tapHome(): Promise<void> {
		await this.elementByID(this.home).waitForDisplayed();
		await this.elementByID(this.home).click();
	}

	async tapSearch(): Promise<void> {
		await this.elementByID(this.search).waitForDisplayed();
		await this.elementByID(this.search).click();
	}

	async tapSearchAndWaitForLoad(): Promise<void> {
		await this.driver.waitUntil(
			async () => {
				await this.elementByID(this.search).waitForDisplayed();
				await this.elementByID(this.search).click();
				const searchBar = this.elementByID(this.searchBar);
				if (!(await searchBar.isExisting())) {
					return false;
				}

				return await searchBar.isDisplayed();
			},
			{ timeoutMsg: 'Timed out navigating to search view' },
		);
	}

	async tapSettings(): Promise<void> {
		await this.elementByID(this.settings).waitForDisplayed();
		await this.elementByID(this.settings).click();
	}

	async isVisible(): Promise<boolean> {
		return (
			(await this.elementByID(this.home).isDisplayed()) &&
			(await this.elementByID(this.search).isDisplayed()) &&
			(await this.elementByID(this.settings).isDisplayed())
		);
	}
}
