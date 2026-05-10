import { BasePage } from './Base';

export class DetailHeaderPage extends BasePage {
	private readonly libraryHeaderNav = 'library-header-nav';
	private readonly artistsTab = 'header-tab-artists';
	private readonly albumsTab = 'header-tab-albums';
	private readonly playlistsTab = 'header-tab-playlists';

	async isHeaderVisible(): Promise<boolean> {
		return await this.elementByID(this.libraryHeaderNav).isDisplayed();
	}

	// Swipes down to pull the library header nav back into view when it has been
	// scrolled off the top of the screen by navigating into a detail view.
	async swipeDownToRevealHeader(): Promise<void> {
		if (await this.isHeaderVisible()) {
			return;
		}

		const rect = await this.driver.getWindowRect();
		const x = Math.floor(rect.width * 0.5);
		const startY = Math.floor(rect.height * 0.35);
		const endY = Math.floor(rect.height * 0.7);

		await this.driver.performActions([
			{
				actions: [
					{ duration: 0, type: 'pointerMove', x, y: startY },
					{ button: 0, type: 'pointerDown' },
					{ duration: 50, type: 'pause' },
					{ duration: 250, type: 'pointerMove', x, y: endY },
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
		await this.elementByID(this.artistsTab).waitForDisplayed();
		await this.elementByID(this.artistsTab).click();
	}

	async tapAlbumsTab(): Promise<void> {
		await this.swipeDownToRevealHeader();
		await this.elementByID(this.albumsTab).waitForDisplayed();
		await this.elementByID(this.albumsTab).click();
	}

	async tapPlaylistsTab(): Promise<void> {
		await this.swipeDownToRevealHeader();
		await this.elementByID(this.playlistsTab).waitForDisplayed();
		await this.elementByID(this.playlistsTab).click();
	}

	async waitForHeaderVisible(): Promise<void> {
		await this.elementByID(this.libraryHeaderNav).waitForDisplayed({
			timeoutMsg: 'timed out waiting for library header nav to appear',
		});
	}
}
