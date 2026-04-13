import { BasePage } from './Base';

export class LibraryPlaylistsTabPage extends BasePage {
	private readonly cardPrefix = 'card-playlist-';
	private readonly grid = 'library-playlists-grid';

	async isVisible(): Promise<boolean> {
		const grid = this.elementByID(this.grid);
		if (!(await grid.isExisting())) {
			return false;
		}

		return await grid.isDisplayed();
	}

	async tapCardByID(playlistId: string): Promise<void> {
		await this.elementByID(`card-${playlistId}`).waitForDisplayed();
		await this.elementByID(`card-${playlistId}`).click();
	}

	async tapFirstVisibleCard(): Promise<void> {
		await this.tapFirstVisibleByAccessibilityPrefix(this.cardPrefix);
	}

	async waitForLoad(): Promise<void> {
		await this.elementByID(this.grid).waitForDisplayed();
		await this.waitForVisibleAccessibilityPrefix(this.cardPrefix);
	}
}
