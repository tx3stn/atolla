import { BasePage } from './Base';

export class DetailHeaderPage extends BasePage {
	private readonly libraryHeaderNav = 'library-header-nav';
	private readonly artistsTab = 'header-tab-artists';
	private readonly albumsTab = 'header-tab-albums';
	private readonly playlistsTab = 'header-tab-playlists';
	private readonly artwork = 'detail-header-artwork';

	async isHeaderVisible(): Promise<boolean> {
		return await this.elementByID(this.libraryHeaderNav).isDisplayed();
	}

	// Drags down on the detail header artwork to trigger the header's onDrag handler,
	// which scrolls the library header nav back into view.
	async swipeDownToRevealHeader(): Promise<void> {
		if (await this.isHeaderVisible()) {
			return;
		}

		const artworkEl = this.elementByID(this.artwork);
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
