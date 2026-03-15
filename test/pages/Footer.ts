import type { Browser, ChainablePromiseElement } from 'webdriverio';
import { BasePage } from './Base';

export class FooterPage extends BasePage {
	private readonly home: ChainablePromiseElement;
	private readonly search: ChainablePromiseElement;
	private readonly settings: ChainablePromiseElement;

	constructor(driver: Browser) {
		super(driver);

		this.home = this.elementByID('footer-home');
		this.search = this.elementByID('footer-search');
		this.settings = this.elementByID('footer-settings');
	}

	async tapHome(): Promise<void> {
		await this.home.click();
	}

	async tapSearch(): Promise<void> {
		await this.search.click();
	}

	async tapSettings(): Promise<void> {
		await this.settings.click();
	}

	async isVisible(): Promise<boolean> {
		return (
			(await this.home.isDisplayed()) &&
			(await this.search.isDisplayed()) &&
			(await this.settings.isDisplayed())
		);
	}
}
