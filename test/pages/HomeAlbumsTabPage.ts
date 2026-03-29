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
				const cards = await this.driver.$$(
					`//*[starts-with(@name, "${this.cardPrefix}") or starts-with(@content-desc, "${this.cardPrefix}")]`,
				);

				for (const card of cards) {
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
