import { BasePage, type PlatformLocator } from './Base';

// On iOS, card containers expose no accessible name. The album name StaticTexts are
// accessible and named; use the first one that is not a header tab label as a content proxy.
const IOS_CONTENT =
	'//XCUIElementTypeStaticText[@accessible="true" and @name!="ARTISTS" and @name!="ALBUMS" and @name!="PLAYLISTS" and @name!="GENRES"]';

export class LibraryAlbumsTabPage extends BasePage {
	private readonly locators = {
		grid: { android: '~library-albums-grid', ios: IOS_CONTENT },
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
		if (this.platform() === 'ios') {
			// StaticText taps don't bubble to the card's press handler on iOS.
			// Tap the first large artwork image (width > 100 excludes nav icons at ~26px).
			for await (const el of this.driver.$$(
				'//XCUIElementTypeImage[@accessible="true" and not(@name) and @width > 100 and @y > 100]',
			)) {
				if (await el.isDisplayed()) {
					await el.click();
					return;
				}
			}
			throw new Error('No visible album artwork found on iOS');
		} else {
			await this.tapFirstVisibleByAccessibilityPrefix(this.cardPrefix);
		}
	}

	async waitForLoad(): Promise<void> {
		if (this.platform() === 'ios') {
			await this.element(this.locators.grid).waitForExist({
				timeoutMsg: 'Timed out waiting for visible album cards',
			});
		} else {
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
}
