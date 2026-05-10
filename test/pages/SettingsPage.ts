import { BasePage } from './Base';

export class SettingsPage extends BasePage {
	private readonly animationsToggle = 'settings-animations-toggle';
	private readonly clearCacheButton = 'settings-cache-clear-btn';
	private readonly cacheClearConfirmButton = 'cache-clear-confirm-btn';
	private readonly logoutButton = 'settings-logout-btn';
	private readonly logoutConfirmButton = 'settings-logout-confirm-btn';

	async waitForLoad(): Promise<void> {
		await this.elementByID(this.animationsToggle).waitForDisplayed({
			timeoutMsg: 'Timed out waiting for settings view',
		});
	}

	async isVisible(): Promise<boolean> {
		const toggle = this.elementByID(this.animationsToggle);
		if (!(await toggle.isExisting())) {
			return false;
		}

		return await toggle.isDisplayed();
	}

	async tapClearCache(): Promise<void> {
		await this.elementByID(this.clearCacheButton).waitForDisplayed();
		await this.elementByID(this.clearCacheButton).click();
		await this.elementByID(this.cacheClearConfirmButton).waitForDisplayed({
			timeoutMsg: 'Timed out waiting for cache clear confirm button',
		});
		await this.elementByID(this.cacheClearConfirmButton).click();
	}

	async tapLogout(): Promise<void> {
		await this.elementByID(this.logoutButton).waitForDisplayed({
			timeoutMsg: 'Timed out waiting for logout button',
		});
		await this.elementByID(this.logoutButton).click();
		await this.elementByID(this.logoutConfirmButton).waitForDisplayed({
			timeoutMsg: 'Timed out waiting for logout confirmation',
		});
		await this.elementByID(this.logoutConfirmButton).click();
	}
}
