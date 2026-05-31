import { BasePage } from './Base';

export class LibraryGenresTabPage extends BasePage {
	private readonly grid = 'library-genres-grid';
	private readonly cardPrefix = 'card-';

	async isVisible(): Promise<boolean> {
		return (await this.allByAccessibilityPrefix(this.cardPrefix)).length > 0;
	}

	async waitForLoad(): Promise<void> {
		await this.elementByID(this.grid).waitForDisplayed({
			timeoutMsg: 'Timed out waiting for genres grid',
		});
		await this.waitForVisibleAccessibilityPrefix(this.cardPrefix);
	}

	async tapFirstVisibleCard(): Promise<void> {
		await this.tapFirstVisibleByAccessibilityPrefix(this.cardPrefix);
	}

	async longPressFirstVisibleCard(): Promise<void> {
		await this.longPressFirstVisibleByAccessibilityPrefix(this.cardPrefix);
	}
}
