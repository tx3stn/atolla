import { BasePage, type PlatformLocator } from './Base';

export class LibraryAlbumsTabPage extends BasePage {
	private readonly locators = {
		grid: { android: '~library-albums-grid', ios: '~library-albums-grid' },
	} satisfies Record<string, PlatformLocator>;

	private readonly cardPrefix = 'card-album-';

	isVisible(): Promise<boolean> {
		return this.element(this.locators.grid).isExisting();
	}

	async tapCardByID(albumId: string): Promise<void> {
		const locator: PlatformLocator = {
			android: `~card-${albumId}`,
			ios: `//*[@name="card-${albumId}"]`,
		};
		await this.element(locator).waitForDisplayed({
			timeoutMsg: `Timed out waiting for album card: card-${albumId}`,
		});
		await this.element(locator).click();
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
