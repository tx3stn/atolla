import { BasePage, type PlatformLocator } from './Base';

// On iOS, card containers expose no accessible name. The artist name StaticTexts are
// accessible and named; use the first one that is not a header tab label as a content proxy.
const IOS_CONTENT =
	'//XCUIElementTypeStaticText[@accessible="true" and @name!="ARTISTS" and @name!="ALBUMS" and @name!="PLAYLISTS" and @name!="GENRES"]';

export class LibraryArtistsTabPage extends BasePage {
	private readonly locators = {
		grid: { android: '~library-artists-grid', ios: IOS_CONTENT },
	} satisfies Record<string, PlatformLocator>;

	private readonly cardPrefix = 'card-artist-';

	isVisible(): Promise<boolean> {
		return this.element(this.locators.grid).isExisting();
	}

	async tapCardByID(artistId: string): Promise<void> {
		const locator: PlatformLocator = {
			android: `~card-${artistId}`,
			ios: `//*[@name="card-${artistId}"]`,
		};
		await this.element(locator).waitForDisplayed({
			timeoutMsg: `Timed out waiting for artist card: card-${artistId}`,
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
			throw new Error('No visible artist artwork found on iOS');
		} else {
			await this.tapFirstVisibleByAccessibilityPrefix(this.cardPrefix);
		}
	}

	async waitForLoad(): Promise<void> {
		await this.element(this.locators.grid).waitForExist({
			timeoutMsg: 'Timed out waiting for artists grid',
		});
		if (this.platform() === 'android') {
			await this.waitForVisibleAccessibilityPrefix(this.cardPrefix);
		}
	}
}
