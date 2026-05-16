import type { Browser } from 'webdriverio';
import { BasePage } from './Base';
import { LibraryAlbumsTabPage } from './LibraryAlbumsTabPage';
import { LibraryArtistsTabPage } from './LibraryArtistsTabPage';
import { LibraryGenresTabPage } from './LibraryGenresTabPage';
import { LibraryPlaylistsTabPage } from './LibraryPlaylistsTabPage';

interface LibraryTabs {
	albums: LibraryAlbumsTabPage;
	artists: LibraryArtistsTabPage;
	genres: LibraryGenresTabPage;
	playlists: LibraryPlaylistsTabPage;
}

export class LibraryPage extends BasePage {
	public readonly tabs: LibraryTabs;

	private readonly albumsHeaderTab = 'header-tab-albums';
	private readonly artistsHeaderTab = 'header-tab-artists';
	private readonly genresHeaderTab = 'header-tab-genres';
	private readonly playlistsHeaderTab = 'header-tab-playlists';
	private readonly headerNav = 'library-header-nav';

	constructor(driver: Browser) {
		super(driver);
		this.tabs = {
			albums: new LibraryAlbumsTabPage(driver),
			artists: new LibraryArtistsTabPage(driver),
			genres: new LibraryGenresTabPage(driver),
			playlists: new LibraryPlaylistsTabPage(driver),
		};
	}

	async waitForLoad(): Promise<void> {
		await this.elementByID(this.albumsHeaderTab).waitForDisplayed({
			timeoutMsg: 'Timed out waiting for albums header tab on library',
		});
		await this.elementByID(this.artistsHeaderTab).waitForDisplayed({
			timeoutMsg: 'Timed out waiting for artists header tab on library',
		});
		await this.elementByID(this.playlistsHeaderTab).waitForDisplayed({
			timeoutMsg: 'Timed out waiting for playlists header tab on library',
		});
	}

	async openAlbumsTab(): Promise<void> {
		await this.tapHeaderTab(this.albumsHeaderTab, 'albums');
		await this.tabs.albums.waitForLoad();
	}

	async openArtistsTab(): Promise<void> {
		await this.tapHeaderTab(this.artistsHeaderTab, 'artists');
		await this.tabs.artists.waitForLoad();
	}

	async openGenresTab(): Promise<void> {
		await this.swipeHeaderLeft();
		await this.tapHeaderTab(this.genresHeaderTab, 'genres');
		await this.tabs.genres.waitForLoad();
	}

	async openPlaylistsTab(): Promise<void> {
		await this.tapHeaderTab(this.playlistsHeaderTab, 'playlists');
		await this.tabs.playlists.waitForLoad();
	}

	private async tapHeaderTab(tabId: string, tabLabel: string): Promise<void> {
		const el = this.elementByID(tabId);
		await el.waitForExist({ timeoutMsg: `Timed out waiting for ${tabLabel} header tab` });

		const primaryDirection = tabLabel === 'albums' || tabLabel === 'artists' ? 'right' : 'left';
		const secondaryDirection = primaryDirection === 'left' ? 'right' : 'left';

		try {
			await el.scrollIntoView({ direction: primaryDirection });
		} catch {
			try {
				await el.scrollIntoView({ direction: secondaryDirection });
			} catch {
				// Some drivers may not support horizontal scrollIntoView for this node.
			}
		}

		await el.waitForDisplayed({ timeoutMsg: `Timed out waiting for ${tabLabel} header tab` });
		await el.click();
	}

	private async swipeHeaderLeft(): Promise<void> {
		const header = this.elementByID(this.headerNav);
		await header.waitForDisplayed({ timeoutMsg: 'Timed out waiting for library header nav' });

		const location = await header.getLocation();
		const size = await header.getSize();
		const y = Math.floor(location.y + size.height * 0.6);
		const startX = Math.floor(location.x + size.width * 0.9);
		const endX = Math.floor(location.x + size.width * 0.2);

		await this.driver.performActions([
			{
				actions: [
					{ duration: 0, type: 'pointerMove', x: startX, y },
					{ button: 0, type: 'pointerDown' },
					{ duration: 80, type: 'pause' },
					{ duration: 320, type: 'pointerMove', x: endX, y },
					{ button: 0, type: 'pointerUp' },
				],
				id: 'library-header-custom-swipe-left',
				parameters: { pointerType: 'touch' },
				type: 'pointer',
			},
		]);
		await this.driver.releaseActions();
	}
}
