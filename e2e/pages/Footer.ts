import { BasePage } from './Base';

export class FooterPage extends BasePage {
	private readonly home = 'footer-home';
	private readonly library = 'footer-library';
	private readonly search = 'footer-search';
	private readonly settings = 'footer-settings';

	async tapHome(): Promise<void> {
		const el = this.elementByID(this.home);
		await el.waitForDisplayed({ timeoutMsg: 'Timed out waiting for footer home button' });
		await el.click();
	}

	async tapLibrary(): Promise<void> {
		const el = this.elementByID(this.library);
		await el.waitForDisplayed({ timeoutMsg: 'Timed out waiting for footer library button' });
		await el.click();
	}

	async tapSearch(): Promise<void> {
		const el = this.elementByID(this.search);
		await el.waitForDisplayed({ timeoutMsg: 'Timed out waiting for footer search button' });
		await el.click();
	}

	async tapSettings(): Promise<void> {
		const el = this.elementByID(this.settings);
		await el.waitForDisplayed({ timeoutMsg: 'Timed out waiting for footer settings button' });
		await el.click();
	}

	async isVisible(): Promise<boolean> {
		return (
			(await this.elementByID(this.home).isDisplayed()) &&
			(await this.elementByID(this.library).isDisplayed()) &&
			(await this.elementByID(this.search).isDisplayed()) &&
			(await this.elementByID(this.settings).isDisplayed())
		);
	}

	async waitForLoad(): Promise<void> {
		await browser.waitUntil(
			async () => {
				return await this.isVisible();
			},
			{ timeoutMsg: 'footer did not appear to load' },
		);
	}
}
