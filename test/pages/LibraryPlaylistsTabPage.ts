import { BasePage } from './Base';

export class LibraryPlaylistsTabPage extends BasePage {
	private readonly cardPrefix = 'card-playlist-';

	async isVisible(): Promise<boolean> {
		const cards = await this.allByAccessibilityPrefix(this.cardPrefix);
		return cards.length > 0;
	}

	async tapCardByID(playlistId: string): Promise<void> {
		await this.elementByID(`card-${playlistId}`).waitForDisplayed({
			timeoutMsg: `Timed out waiting for playlist card: card-${playlistId}`,
		});
		await this.elementByID(`card-${playlistId}`).click();
	}

	async tapFirstVisibleCard(): Promise<void> {
		await this.tapFirstVisibleByAccessibilityPrefix(this.cardPrefix);
	}

	async waitForLoad(): Promise<void> {
		await this.waitForVisibleAccessibilityPrefix(this.cardPrefix);
	}
}
