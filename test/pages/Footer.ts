import type { Browser } from 'webdriverio';
import { BasePage } from './Base';

export class FooterPage extends BasePage {
	private readonly home: string;
	private readonly search: string;
	private readonly settings: string;

	constructor(driver: Browser) {
		super(driver);

		this.home = 'footer-home';
		this.search = 'footer-search';
		this.settings = 'footer-settings';
	}

	async tapHome(): Promise<void> {
		await this.elementByID(this.home).click();
	}

	async tapSearch(): Promise<void> {
		await this.elementByID(this.search).click();
	}

	async tapSettings(): Promise<void> {
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
