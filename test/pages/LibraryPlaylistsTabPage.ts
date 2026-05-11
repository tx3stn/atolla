import { BasePage, type PlatformLocator } from './Base';

// On iOS, card containers expose no accessible name. The playlist name StaticTexts are
// accessible and named; use the first one that is not a header tab label as a content proxy.
const IOS_CONTENT =
	'//XCUIElementTypeStaticText[@accessible="true" and @name!="ARTISTS" and @name!="ALBUMS" and @name!="PLAYLISTS" and @name!="GENRES"]';

export class LibraryPlaylistsTabPage extends BasePage {
	private readonly locators = {
		grid: { android: '~library-playlists-grid', ios: IOS_CONTENT },
	} satisfies Record<string, PlatformLocator>;

	private readonly cardPrefix = 'card-playlist-';

	isVisible(): Promise<boolean> {
		return this.element(this.locators.grid).isExisting();
	}

	async tapCardByID(playlistId: string): Promise<void> {
		const locator: PlatformLocator = {
			android: `~card-${playlistId}`,
			ios: `//*[@name="card-${playlistId}"]`,
		};
		await this.element(locator).waitForDisplayed({
			timeoutMsg: `Timed out waiting for playlist card: card-${playlistId}`,
		});
		await this.element(locator).click();
	}

	async tapFirstVisibleCard(): Promise<void> {
		if (this.platform() === 'ios') {
			// Playlist cards have no artwork images — they show a "PLAYLIST" text placeholder.
			// Wait for the grid to settle (navigation animation may still be running when called).
			await this.driver
				.$('//XCUIElementTypeStaticText[@name="PLAYLIST"]')
				.waitForExist({ timeoutMsg: 'Timed out waiting for playlist card placeholder to appear' });
			// Tap the parent container of the first visible placeholder below the header (y > 100).
			for await (const el of this.driver.$$(
				'//XCUIElementTypeStaticText[@accessible="true" and @name="PLAYLIST" and @y > 100]/..',
			)) {
				if (await el.isDisplayed()) {
					await el.click();
					return;
				}
			}
			throw new Error('No visible playlist card found on iOS');
		} else {
			await this.tapFirstVisibleByAccessibilityPrefix(this.cardPrefix);
		}
	}

	async waitForLoad(): Promise<void> {
		await this.element(this.locators.grid).waitForExist({
			timeoutMsg: 'Timed out waiting for playlists grid',
		});
		if (this.platform() === 'android') {
			await this.waitForVisibleAccessibilityPrefix(this.cardPrefix);
		}
	}
}
