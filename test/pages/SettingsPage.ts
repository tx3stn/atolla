import { BasePage, type PlatformLocator } from './Base';

export class SettingsPage extends BasePage {
	private readonly locators = {
		// Button component renders as <view> on iOS; find by visible text
		cacheClearConfirmButton: {
			android: '~cache-clear-confirm-btn',
			ios: '//XCUIElementTypeStaticText[@name="yes"]/..',
		},
		clearCacheButton: {
			android: '~settings-cache-clear-btn',
			ios: '//XCUIElementTypeStaticText[@name="Clear Cache"]/..',
		},
		logoutButton: {
			android: '~settings-logout-btn',
			ios: '//XCUIElementTypeStaticText[@name="Logout"]/..',
		},
		logoutConfirmButton: {
			android: '~settings-logout-confirm-btn',
			ios: '//XCUIElementTypeStaticText[@name="yes"]/..',
		},
		// On iOS, the animations toggle is a custom Valdi view; use device ID textfield as page indicator
		pageIndicator: {
			android: '~settings-animations-toggle',
			ios: '~settings-jellyfin-device-id-input',
		},
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
