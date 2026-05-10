import { BasePage, type PlatformLocator } from './Base';

export class DetailHeaderPage extends BasePage {
	private readonly locators = {
		albumsTab: {
			android: '~header-tab-albums',
			ios: '//XCUIElementTypeStaticText[@name="ALBUMS"]/..',
		},
		artistsTab: {
			android: '~header-tab-artists',
			ios: '//XCUIElementTypeStaticText[@name="ARTISTS"]/..',
		},
		// On iOS, target the first image in the detail header area to get swipe coordinates
		artwork: { android: '~detail-header-artwork', ios: '//XCUIElementTypeImage[1]' },
		// On iOS, use ARTISTS tab text as a proxy for the header nav being visible
		libraryHeaderNav: {
			android: '~library-header-nav',
			ios: '//XCUIElementTypeStaticText[@name="ARTISTS"]',
		},
		playlistsTab: {
			android: '~header-tab-playlists',
			ios: '//XCUIElementTypeStaticText[@name="PLAYLISTS"]/..',
		},
	} satisfies Record<string, PlatformLocator>;

	isHeaderVisible(): Promise<boolean> {
		return this.element(this.locators.libraryHeaderNav).isDisplayed();
	}

	// Drags down on the detail header artwork to trigger the header's onDrag handler,
	// which scrolls the library header nav back into view.
	async swipeDownToRevealHeader(): Promise<void> {
		if (await this.isHeaderVisible()) {
			return;
		}

		const artworkEl = this.element(this.locators.artwork);
		await artworkEl.waitForExist({ timeoutMsg: 'Timed out waiting for detail header artwork' });
		const location = await artworkEl.getLocation();
		const size = await artworkEl.getSize();

		const x = Math.floor(location.x + size.width * 0.5);
		const startY = Math.floor(location.y + size.height * 0.3);
		const endY = Math.floor(location.y + size.height * 0.9);

		await this.driver.performActions([
			{
				actions: [
					{ duration: 0, type: 'pointerMove', x, y: startY },
					{ button: 0, type: 'pointerDown' },
					{ duration: 50, type: 'pause' },
					{ duration: 300, type: 'pointerMove', x, y: endY },
					{ button: 0, type: 'pointerUp' },
				],
				id: 'reveal-header-finger',
				parameters: { pointerType: 'touch' },
				type: 'pointer',
			},
		]);
		await this.driver.releaseActions();
	}

	async tapArtistsTab(): Promise<void> {
		await this.swipeDownToRevealHeader();
		await this.element(this.locators.artistsTab).waitForDisplayed({
			timeoutMsg: 'Timed out waiting for artists tab',
		});
		await this.element(this.locators.artistsTab).click();
	}

	async tapAlbumsTab(): Promise<void> {
		await this.swipeDownToRevealHeader();
		await this.element(this.locators.albumsTab).waitForDisplayed({
			timeoutMsg: 'Timed out waiting for albums tab',
		});
		await this.element(this.locators.albumsTab).click();
	}

	async tapPlaylistsTab(): Promise<void> {
		await this.swipeDownToRevealHeader();
		await this.element(this.locators.playlistsTab).waitForDisplayed({
			timeoutMsg: 'Timed out waiting for playlists tab',
		});
		await this.element(this.locators.playlistsTab).click();
	}

	async waitForHeaderVisible(): Promise<void> {
		await this.element(this.locators.libraryHeaderNav).waitForDisplayed({
			timeoutMsg: 'timed out waiting for library header nav to appear',
		});
	}
}
