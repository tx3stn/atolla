import { BasePage } from './Base';

export class LibraryArtistsTabPage extends BasePage {
	private readonly cardPrefix = 'card-artist-';

	async isVisible(): Promise<boolean> {
		const cards = await this.allByAccessibilityPrefix(this.cardPrefix);
		return cards.length > 0;
	}

	async tapCardByID(artistId: string): Promise<void> {
		await this.elementByID(`card-${artistId}`).waitForDisplayed({
			timeoutMsg: `Timed out waiting for artist card: card-${artistId}`,
		});
		await this.elementByID(`card-${artistId}`).click();
	}

	async tapFirstVisibleCard(): Promise<void> {
		await this.tapFirstVisibleByAccessibilityPrefix(this.cardPrefix);
	}

	async waitForLoad(): Promise<void> {
		await this.waitForVisibleAccessibilityPrefix(this.cardPrefix);
	}
}
