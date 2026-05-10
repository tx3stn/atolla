import { BasePage, type PlatformLocator } from './Base';

export class Toast extends BasePage {
	private readonly locators = {
		root: { android: '~toast', ios: '~toast' },
	} satisfies Record<string, PlatformLocator>;

	isVisible(): Promise<boolean> {
		return this.element(this.locators.root).isExisting();
	}

	async waitForVisible(): Promise<void> {
		await this.element(this.locators.root).waitForDisplayed({
			timeoutMsg: 'Timed out waiting for toast to appear',
		});
	}

	async waitForHidden(): Promise<void> {
		await this.driver.waitUntil(
			async () => !(await this.element(this.locators.root).isExisting()),
			{ timeoutMsg: 'Timed out waiting for toast to dismiss' },
		);
	}
}
