import { BasePage } from './Base';

export class SettingsPage extends BasePage {
	private readonly settingsPrefix = 'settings-';
	private readonly firstRow = 'settings-animations-toggle';
	private readonly clearCacheButton = 'settings-cache-clear-btn';
	private readonly cacheClearConfirmButton = 'cache-clear-confirm-btn';
	private readonly logoutButton = 'settings-logout-btn';
	private readonly logoutConfirmButton = 'settings-logout-confirm-btn';

	async waitForLoad(): Promise<void> {
		await this.driver.waitUntil(async () => this.isVisible(), {
			timeoutMsg: 'Timed out waiting for settings view',
		});
	}

	async isVisible(): Promise<boolean> {
		return (await this.allByAccessibilityPrefix(this.settingsPrefix)).length > 0;
	}

	async scrollToTop(maxSteps = 10): Promise<void> {
		const firstRow = this.elementByID(this.firstRow);
		for (let step = 0; step < maxSteps; step += 1) {
			if (await firstRow.isExisting()) {
				await this.scrollIntoTappableArea(firstRow);
				return;
			}
			await this.creepUp();
		}
		throw new Error('Timed out scrolling settings back to the top');
	}

	async tapClearCache(): Promise<void> {
		await this.tapAndConfirm(this.clearCacheButton, this.cacheClearConfirmButton, 'clear cache');
	}

	async tapLogout(): Promise<void> {
		await this.tapAndConfirm(this.logoutButton, this.logoutConfirmButton, 'logout');
	}

	private async tapAndConfirm(buttonId: string, confirmId: string, label: string): Promise<void> {
		const button = this.elementByID(buttonId);
		await button.waitForExist({ timeoutMsg: `Timed out waiting for ${label} button` });
		const confirm = this.elementByID(confirmId);

		for (let attempt = 0; attempt < 3; attempt += 1) {
			await this.scrollIntoTappableArea(button);
			await button.click();
			const confirmShown = await confirm.waitForDisplayed({ timeout: 2_000 }).then(
				() => true,
				() => false,
			);
			if (confirmShown) {
				await confirm.click();
				return;
			}
		}

		throw new Error(`Timed out waiting for ${label} confirmation`);
	}
}
