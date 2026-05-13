import { BasePage, type PlatformLocator } from './Base';

export class SearchPage extends BasePage {
	private readonly locators = {
		input: { android: '~search-input', ios: '~search-input' },
		retryButton: { android: '~search-retry', ios: '~search-retry' },
		searchSubmit: { android: '~search-submit', ios: '~search-submit' },
	} satisfies Record<string, PlatformLocator>;

	async waitForLoad(): Promise<void> {
		await this.element(this.locators.input).waitForDisplayed({
			timeoutMsg: 'Timed out waiting for search view',
		});
	}

	public async dismissKeyboard(): Promise<void> {
		if (this.isIOS()) {
			await this.driver.$('~search-submit').click();
		} else {
			try {
				await this.driver.hideKeyboard();
			} catch {
				// keyboard not visible
			}
		}
	}

	public isVisible(): Promise<boolean> {
		return this.element(this.locators.input).isExisting();
	}

	async enterSearchQuery(query: string): Promise<void> {
		await this.element(this.locators.input).waitForDisplayed({
			timeoutMsg: 'Timed out waiting for search input',
		});
		await this.element(this.locators.input).click();
		if (this.platform() === 'android') {
			// mobile: type fires onChange/TextWatcher events (unlike setValue which uses setText
			// and bypasses the listener).
			await this.element(this.locators.input).clearValue();
			await this.driver.execute('mobile: type', { text: query });
		} else {
			await this.element(this.locators.input).setValue(query);
		}
		await this.element(this.locators.searchSubmit).waitForDisplayed({
			timeoutMsg: 'Timed out waiting for search submit',
		});
		await this.element(this.locators.searchSubmit).click();
	}

	async tapRetry(): Promise<void> {
		await this.element(this.locators.retryButton).waitForDisplayed({
			timeoutMsg: 'Timed out waiting for retry button',
		});
		await this.element(this.locators.retryButton).click();
	}

	async waitForAnyResultCard(): Promise<boolean> {
		await this.waitForVisibleAccessibilityPrefix('card-');
		return true;
	}
}
