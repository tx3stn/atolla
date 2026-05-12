import { BasePage, type PlatformLocator } from './Base';

export class FooterPage extends BasePage {
	private readonly locators = {
		home: { android: '~footer-home', ios: '~footer-home' },
		library: { android: '~footer-library', ios: '~footer-library' },
		search: { android: '~footer-search', ios: '~footer-search' },
		settings: { android: '~footer-settings', ios: '~footer-settings' },
	} satisfies Record<string, PlatformLocator>;

	async tapHome(): Promise<void> {
		await this.element(this.locators.home).waitForDisplayed({
			timeoutMsg: 'Timed out waiting for footer home button',
		});
		await this.element(this.locators.home).click();
	}

	async tapLibrary(): Promise<void> {
		await this.element(this.locators.library).waitForDisplayed({
			timeoutMsg: 'Timed out waiting for footer library button',
		});
		await this.element(this.locators.library).click();
	}

	async tapSearch(): Promise<void> {
		await this.element(this.locators.search).waitForDisplayed({
			timeoutMsg: 'Timed out waiting for footer search button',
		});
		await this.element(this.locators.search).click();
	}

	async tapSearchAndWaitForLoad(): Promise<void> {
		await this.element(this.locators.search).waitForDisplayed({
			timeoutMsg: 'Timed out waiting for footer search button',
		});
		await this.element(this.locators.search).click();
		await this.elementByID('search-input').waitForDisplayed({
			timeoutMsg: 'Timed out navigating to search view',
		});
	}

	async tapSettings(): Promise<void> {
		await this.element(this.locators.settings).waitForDisplayed({
			timeoutMsg: 'Timed out waiting for footer settings button',
		});
		await this.element(this.locators.settings).click();
	}

	async isVisible(): Promise<boolean> {
		return (
			(await this.element(this.locators.home).isDisplayed()) &&
			(await this.element(this.locators.library).isDisplayed()) &&
			(await this.element(this.locators.search).isDisplayed()) &&
			(await this.element(this.locators.settings).isDisplayed())
		);
	}
}
