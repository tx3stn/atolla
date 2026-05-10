import { BasePage } from './Base';

export class LibraryArtistsTabPage extends BasePage {
	private readonly cardPrefix = 'card-artist-';
	private readonly grid = 'library-artists-grid';

	async isVisible(): Promise<boolean> {
		const grid = this.elementByID(this.grid);
		if (!(await grid.isExisting())) {
			return false;
		}

		return await grid.isDisplayed();
	}

	async tapCardByID(artistId: string): Promise<void> {
		await this.elementByID(`card-${artistId}`).waitForDisplayed();
		await this.elementByID(`card-${artistId}`).click();
	}

	async tapFirstVisibleCard(): Promise<void> {
		await this.tapFirstVisibleByAccessibilityPrefix(this.cardPrefix);
	}

	async waitForLoad(): Promise<void> {
		await this.driver.waitUntil(async () => await this.elementByID(this.grid).isExisting(), {
			timeoutMsg: 'Timed out waiting for artists grid',
		});
		await this.waitForVisibleAccessibilityPrefix(this.cardPrefix);
	}
}
