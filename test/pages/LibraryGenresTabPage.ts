import { BasePage } from './Base';

export class LibraryGenresTabPage extends BasePage {
	private readonly cardPrefix = 'card-genre-';

	async isVisible(): Promise<boolean> {
		return (await this.allByAccessibilityPrefix(this.cardPrefix)).length > 0;
	}

	async waitForLoad(): Promise<void> {
		await this.waitForVisibleAccessibilityPrefix(this.cardPrefix);
	}

	async tapFirstVisibleCard(): Promise<void> {
		await this.tapFirstVisibleByAccessibilityPrefix(this.cardPrefix);
	}

	async longPressFirstVisibleCard(): Promise<void> {
		await this.longPressFirstVisibleByAccessibilityPrefix(this.cardPrefix);
	}
}
