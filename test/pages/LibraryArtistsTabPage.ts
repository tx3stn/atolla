import { BasePage } from './Base';

export class LibraryArtistsTabPage extends BasePage {
	private readonly cardPrefix = 'card-artist-';

	async isVisible(): Promise<boolean> {
		return (await this.allByAccessibilityPrefix(this.cardPrefix)).length > 0;
	}

	async waitForLoad(): Promise<void> {
		await this.waitForVisibleAccessibilityPrefix(this.cardPrefix);
	}

	async tapCardByID(artistId: string): Promise<void> {
		const el = this.elementByID(`card-${artistId}`);
		await el.waitForDisplayed({
			timeoutMsg: `Timed out waiting for artist card: card-${artistId}`,
		});
		await el.click();
	}

	async tapFirstVisibleCard(): Promise<void> {
		await this.tapFirstVisibleByAccessibilityPrefix(this.cardPrefix);
	}

	async longPressFirstVisibleCard(): Promise<void> {
		await this.longPressFirstVisibleByAccessibilityPrefix(this.cardPrefix);
	}
}
