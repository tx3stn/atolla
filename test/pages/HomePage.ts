import type { Browser } from 'webdriverio';

export class HomePage {
	constructor(private readonly driver: Browser) {}

	private readonly selectors = {
		albumsGrid: `~home-albums-grid`,
		albumsTab: '~header-tab-albums',
		artistsGrid: `~home-artists-grid`,
		artistsTab: '~header-tab-artists',
		playlistsTab: '~header-tab-playlists',
	};

	async albumsGridIsVisible(): Promise<boolean> {
		return await this.driver.$(this.selectors.albumsGrid).isDisplayed();
	}

	async albumsTabIsVisible(): Promise<boolean> {
		return await this.driver.$(this.selectors.albumsGrid).isDisplayed();
	}

	async artistGridIsVisible(): Promise<boolean> {
		return await this.driver.$(this.selectors.artistsGrid).isDisplayed();
	}

	async tapHeaderAlbums(): Promise<void> {
		await this.driver.$(this.selectors.albumsTab).click();
	}

	async waitForAlbumsTab(): Promise<void> {
		await this.driver.$(this.selectors.albumsGrid).waitForDisplayed();
	}

	async waitForLoad(): Promise<void> {
		await this.driver.$(this.selectors.artistsTab).waitForDisplayed();
		await this.driver.$(this.selectors.albumsTab).waitForDisplayed();
		await this.driver.$(this.selectors.playlistsTab).waitForDisplayed();
	}
}
