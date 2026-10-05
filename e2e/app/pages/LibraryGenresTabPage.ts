import { BasePage } from './Base';

export class LibraryGenresTabPage extends BasePage {
	private readonly grid = 'library-genres-grid';
	private readonly cardPrefix = 'card-';

	gridExistsWithin(timeout: number): Promise<boolean> {
		return this.elementByID(this.grid)
			.waitForExist({ timeout })
			.then(
				() => true,
				() => false,
			);
	}

	async isVisible(): Promise<boolean> {
		return (await this.allByAccessibilityPrefix(this.cardPrefix)).length > 0;
	}

	// the grid marker is a zero-size view pinned to the top of the grid, so it stops reporting as
	// displayed once the grid is scrolled: its existence plus a visible card is the real signal
	async waitForLoad(): Promise<void> {
		await this.elementByID(this.grid).waitForExist({
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

	async longPressCardByID(genreId: string): Promise<void> {
		const element = await this.scrollUntilDisplayed(`card-${genreId}`);
		await this.longPressElement(element);
	}
}
