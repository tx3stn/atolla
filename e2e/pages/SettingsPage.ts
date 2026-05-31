import { BasePage } from './Base';

export class SettingsPage extends BasePage {
	private readonly pageIndicator = 'settings-animations-toggle';
	private readonly clearCacheButton = 'settings-cache-clear-btn';
	private readonly cacheClearConfirmButton = 'cache-clear-confirm-btn';
	private readonly logoutButton = 'settings-logout-btn';
	private readonly logoutConfirmButton = 'settings-logout-confirm-btn';

	async waitForLoad(): Promise<void> {
		await this.elementByID(this.pageIndicator).waitForDisplayed({
			timeoutMsg: 'Timed out waiting for settings view',
		});
	}

	isVisible(): Promise<boolean> {
		return this.elementByID(this.pageIndicator).isExisting();
	}

	async tapClearCache(): Promise<void> {
		const clearBtn = this.elementByID(this.clearCacheButton);
		await clearBtn.waitForDisplayed({ timeoutMsg: 'Timed out waiting for clear cache button' });
		await clearBtn.click();
		const confirmBtn = this.elementByID(this.cacheClearConfirmButton);
		await confirmBtn.waitForDisplayed({
			timeoutMsg: 'Timed out waiting for cache clear confirm button',
		});
		await confirmBtn.click();
	}

	async tapLogout(): Promise<void> {
		const logoutBtn = this.elementByID(this.logoutButton);
		await logoutBtn.waitForDisplayed({ timeoutMsg: 'Timed out waiting for logout button' });
		await logoutBtn.click();
		const confirmBtn = this.elementByID(this.logoutConfirmButton);
		await confirmBtn.waitForDisplayed({ timeoutMsg: 'Timed out waiting for logout confirmation' });
		await confirmBtn.click();
	}
}
