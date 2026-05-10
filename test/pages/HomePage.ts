import { BasePage } from './Base';

export class HomePage extends BasePage {
	private readonly albumCardPrefix = 'card-album-';
	private readonly recentlyAddedGrid = 'home-recently-added-grid';

	async isDisplayed(): Promise<boolean> {
		return await this.elementByID(this.recentlyAddedGrid).isDisplayed();
	}

	async hasAlbumCards(timeout = 5_000): Promise<boolean> {
		try {
			await this.driver.waitUntil(
				async () => {
					for await (const el of this.driver.$$(
						`//*[starts-with(@name, "${this.albumCardPrefix}") or starts-with(@content-desc, "${this.albumCardPrefix}")]`,
					)) {
						if (await el.isDisplayed()) return true;
					}
					return false;
				},
				{ timeout },
			);
			return true;
		} catch {
			return false;
		}
	}

	async tapFirstVisibleAlbumCard(): Promise<void> {
		await this.tapFirstVisibleByAccessibilityPrefix(this.albumCardPrefix);
	}

	async waitForLoad(): Promise<void> {
		await this.driver.waitUntil(
			async () => await this.elementByID(this.recentlyAddedGrid).isExisting(),
			{ timeoutMsg: 'Timed out waiting for home view' },
		);
	}
}
