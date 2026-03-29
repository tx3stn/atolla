import { BasePage } from './Base';

export class HomeAlbumsTabPage extends BasePage {
	private readonly cardPrefix = 'card-album-';
	private readonly grid = 'home-albums-grid';

	async isVisible(): Promise<boolean> {
		const grid = this.elementByID(this.grid);
		if (!(await grid.isExisting())) {
			return false;
		}

		return await grid.isDisplayed();
	}

	async tapCardByID(albumId: string): Promise<void> {
		await this.elementByID(`card-${albumId}`).waitForDisplayed();
		await this.elementByID(`card-${albumId}`).click();
	}

	async tapFirstVisibleCard(): Promise<void> {
		await this.tapFirstVisibleByAccessibilityPrefix(this.cardPrefix);
	}

	async waitForLoad(): Promise<void> {
		await this.elementByID(this.grid).waitForDisplayed();
		await this.waitForVisibleAccessibilityPrefix(this.cardPrefix);
	}
}
