import { BasePage } from './Base';

export class LibraryAlbumsTabPage extends BasePage {
	private readonly cardPrefix = 'card-album-';

	async isVisible(): Promise<boolean> {
		const cards = await this.allByAccessibilityPrefix(this.cardPrefix);
		return cards.length > 0;
	}

	async tapCardByID(albumId: string): Promise<void> {
		await this.elementByID(`card-${albumId}`).waitForDisplayed({
			timeoutMsg: `Timed out waiting for album card: card-${albumId}`,
		});
		await this.elementByID(`card-${albumId}`).click();
	}

	async tapFirstVisibleCard(): Promise<void> {
		await this.tapFirstVisibleByAccessibilityPrefix(this.cardPrefix);
	}

	async waitForLoad(): Promise<void> {
		await this.driver.waitUntil(
			async () => {
				for await (const card of this.driver.$$(
					`//*[starts-with(@name, "${this.cardPrefix}") or starts-with(@content-desc, "${this.cardPrefix}")]`,
				)) {
					if (await card.isDisplayed()) {
						return true;
					}
				}

				return false;
			},
			{ timeoutMsg: 'Timed out waiting for visible album cards' },
		);
	}
}
