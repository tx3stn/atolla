import type { Browser } from 'webdriverio';
import { BasePage } from './Base';

export class FooterPage extends BasePage {
	private readonly home: string;
	private readonly library: string;
	private readonly searchBar: string;
	private readonly search: string;
	private readonly settings: string;

	constructor(driver: Browser) {
		super(driver);

		this.home = 'footer-home';
		this.library = 'footer-library';
		this.searchBar = 'search-bar';
		this.search = 'footer-search';
		this.settings = 'footer-settings';
	}

	async tapHome(): Promise<void> {
		await this.elementByID(this.home).waitForDisplayed({
			timeoutMsg: 'Timed out waiting for footer home button',
		});
		await this.elementByID(this.home).click();
	}

	async tapLibrary(): Promise<void> {
		await this.elementByID(this.library).waitForDisplayed({
			timeoutMsg: 'Timed out waiting for footer library button',
		});
		await this.elementByID(this.library).click();
	}

	async tapSearch(): Promise<void> {
		await this.elementByID(this.search).waitForDisplayed({
			timeoutMsg: 'Timed out waiting for footer search button',
		});
		await this.elementByID(this.search).click();
	}

	async tapSearchAndWaitForLoad(): Promise<void> {
		await this.elementByID(this.search).waitForDisplayed({
			timeoutMsg: 'Timed out waiting for footer search button',
		});
		await this.elementByID(this.search).click();
		await this.elementByID(this.searchBar).waitForDisplayed({
			timeoutMsg: 'Timed out navigating to search view',
		});
	}

	async tapSettings(): Promise<void> {
		await this.elementByID(this.settings).waitForDisplayed({
			timeoutMsg: 'Timed out waiting for footer settings button',
		});
		await this.elementByID(this.settings).click();
	}

	async isVisible(): Promise<boolean> {
		return (
			(await this.elementByID(this.home).isDisplayed()) &&
			(await this.elementByID(this.library).isDisplayed()) &&
			(await this.elementByID(this.search).isDisplayed()) &&
			(await this.elementByID(this.settings).isDisplayed())
		);
	}
}
