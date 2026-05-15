import { BasePage } from './Base';

export class DetailHeaderPage extends BasePage {
	private readonly libraryHeaderNav = 'library-header-nav';
	private readonly artwork = 'detail-header-artwork';
	private readonly albumsTab = 'header-tab-albums';
	private readonly artistsTab = 'header-tab-artists';
	private readonly playlistsTab = 'header-tab-playlists';

	isHeaderVisible(): Promise<boolean> {
		return this.elementByID(this.libraryHeaderNav).isDisplayed();
	}

	async waitForHeaderVisible(): Promise<void> {
		await this.elementByID(this.libraryHeaderNav).waitForDisplayed({
			timeoutMsg: 'Timed out waiting for library header nav to appear',
		});
	}

	// Drags down on the detail header artwork to trigger the header's onDrag handler,
	// which scrolls the library header nav back into view.
	async swipeDownToRevealHeader(): Promise<void> {
		if (await this.isHeaderVisible()) {
			return;
		}

		const artworkEl = this.elementByID(this.artwork);

		const swipe = async (x: number, startY: number, endY: number): Promise<void> => {
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
		};

		let usedArtworkSwipe = false;
		try {
			if ((await artworkEl.isExisting()) && (await artworkEl.isDisplayed())) {
				const location = await artworkEl.getLocation();
				const size = await artworkEl.getSize();

				const x = Math.floor(location.x + size.width * 0.5);
				const startY = Math.floor(location.y + size.height * 0.3);
				const endY = Math.floor(location.y + size.height * 0.9);

				await swipe(x, startY, endY);
				usedArtworkSwipe = true;
			}
		} catch {
			usedArtworkSwipe = false;
		}

		if (!usedArtworkSwipe) {
			const rect = await this.driver.getWindowRect();
			const x = Math.floor(rect.width * 0.5);
			const startY = Math.floor(rect.height * 0.2);
			const endY = Math.floor(rect.height * 0.55);
			await swipe(x, startY, endY);
		}

		await this.waitForHeaderVisible();
	}

	async tapArtistsTab(): Promise<void> {
		const el = this.elementByID(this.artistsTab);
		await el.waitForDisplayed({ timeoutMsg: 'Timed out waiting for artists tab' });
		await el.click();
	}

	async tapAlbumsTab(): Promise<void> {
		const el = this.elementByID(this.albumsTab);
		await el.waitForDisplayed({ timeoutMsg: 'Timed out waiting for albums tab' });
		await el.click();
	}

	async tapPlaylistsTab(): Promise<void> {
		const el = this.elementByID(this.playlistsTab);
		await el.waitForDisplayed({ timeoutMsg: 'Timed out waiting for playlists tab' });
		await el.click();
	}
}
