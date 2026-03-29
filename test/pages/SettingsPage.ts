import type { Browser } from 'webdriverio';
import { BasePage } from './Base';

export class SettingsPage extends BasePage {
	private readonly animationsToggle: string;
	private readonly clearCacheButton: string;
	private readonly generatePalettesButton: string;

	constructor(driver: Browser) {
		super(driver);
		this.animationsToggle = 'settings-animations-toggle';
		this.clearCacheButton = 'settings-cache-clear-btn';
		this.generatePalettesButton = 'settings-generate-palettes-btn';
	}

	async waitForLoad(): Promise<void> {
		await this.elementByID(this.animationsToggle).waitForDisplayed();
		await this.elementByID(this.generatePalettesButton).waitForDisplayed();
	}

	async isVisible(): Promise<boolean> {
		const toggle = this.elementByID(this.animationsToggle);
		if (!(await toggle.isExisting())) {
			return false;
		}

		return await toggle.isDisplayed();
	}

	async tapGeneratePalettes(): Promise<void> {
		await this.elementByID(this.generatePalettesButton).waitForDisplayed();
		await this.elementByID(this.generatePalettesButton).click();
	}

	async tapClearCache(): Promise<void> {
		await this.elementByID(this.clearCacheButton).waitForDisplayed();
		await this.elementByID(this.clearCacheButton).click();
	}
}
