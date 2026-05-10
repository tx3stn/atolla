import { BasePage } from './Base';

export class HomePage extends BasePage {
	private readonly homeView = 'home-view';
	private readonly albumCardPrefix = 'card-album-';

	async waitForLoad(): Promise<void> {
		await this.elementByID(this.homeView).waitForDisplayed({
			timeoutMsg: 'Timed out waiting for home view',
		});
	}

	async tapFirstVisibleAlbumCard(): Promise<void> {
		await this.tapFirstVisibleByAccessibilityPrefix(this.albumCardPrefix);
	}

	async hasAlbumCards(timeout = 5_000): Promise<boolean> {
		try {
			await this.driver.waitUntil(
				async () => {
					const elements = await this.driver.$$(
						`//*[starts-with(@name, "${this.albumCardPrefix}") or starts-with(@content-desc, "${this.albumCardPrefix}")]`,
					);
					for (const el of elements) {
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
}
