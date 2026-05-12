import { BasePage, type PlatformLocator } from './Base';

export class SettingsPage extends BasePage {
	private readonly locators = {
		cacheClearConfirmButton: {
			android: '~cache-clear-confirm-btn',
			ios: '~cache-clear-confirm-btn',
		},
		clearCacheButton: { android: '~settings-cache-clear-btn', ios: '~settings-cache-clear-btn' },
		logoutButton: { android: '~settings-logout-btn', ios: '~settings-logout-btn' },
		logoutConfirmButton: {
			android: '~settings-logout-confirm-btn',
			ios: '~settings-logout-confirm-btn',
		},
		pageIndicator: { android: '~settings-animations-toggle', ios: '~settings-animations-toggle' },
	} satisfies Record<string, PlatformLocator>;

	async waitForLoad(): Promise<void> {
		await this.element(this.locators.pageIndicator).waitForDisplayed({
			timeoutMsg: 'Timed out waiting for settings view',
		});
	}

	isVisible(): Promise<boolean> {
		return this.element(this.locators.pageIndicator).isExisting();
	}

	async tapClearCache(): Promise<void> {
		await this.element(this.locators.clearCacheButton).waitForDisplayed({
			timeoutMsg: 'Timed out waiting for clear cache button',
		});
		await this.element(this.locators.clearCacheButton).click();
		await this.element(this.locators.cacheClearConfirmButton).waitForDisplayed({
			timeoutMsg: 'Timed out waiting for cache clear confirm button',
		});
		await this.element(this.locators.cacheClearConfirmButton).click();
	}

	async tapLogout(): Promise<void> {
		await this.element(this.locators.logoutButton).waitForDisplayed({
			timeoutMsg: 'Timed out waiting for logout button',
		});
		await this.element(this.locators.logoutButton).click();
		await this.element(this.locators.logoutConfirmButton).waitForDisplayed({
			timeoutMsg: 'Timed out waiting for logout confirmation',
		});
		await this.element(this.locators.logoutConfirmButton).click();
	}
}
