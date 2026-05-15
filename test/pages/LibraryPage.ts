import type { Browser } from 'webdriverio';
import { BasePage } from './Base';
import { LibraryAlbumsTabPage } from './LibraryAlbumsTabPage';
import { LibraryArtistsTabPage } from './LibraryArtistsTabPage';
import { LibraryPlaylistsTabPage } from './LibraryPlaylistsTabPage';

interface LibraryTabs {
	albums: LibraryAlbumsTabPage;
	artists: LibraryArtistsTabPage;
	playlists: LibraryPlaylistsTabPage;
}

export class LibraryPage extends BasePage {
	public readonly tabs: LibraryTabs;

	private readonly albumsHeaderTab = 'header-tab-albums';
	private readonly artistsHeaderTab = 'header-tab-artists';
	private readonly playlistsHeaderTab = 'header-tab-playlists';

	constructor(driver: Browser) {
		super(driver);
		this.tabs = {
			albums: new LibraryAlbumsTabPage(driver),
			artists: new LibraryArtistsTabPage(driver),
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
		const el = this.elementByID(this.albumsHeaderTab);
		await el.waitForDisplayed({ timeoutMsg: 'Timed out waiting for albums header tab' });
		await el.click();
		await this.tabs.albums.waitForLoad();
	}

	async openArtistsTab(): Promise<void> {
		const el = this.elementByID(this.artistsHeaderTab);
		await el.waitForDisplayed({ timeoutMsg: 'Timed out waiting for artists header tab' });
		await el.click();
		await this.tabs.artists.waitForLoad();
	}

	async openPlaylistsTab(): Promise<void> {
		const el = this.elementByID(this.playlistsHeaderTab);
		await el.waitForDisplayed({ timeoutMsg: 'Timed out waiting for playlists header tab' });
		await el.click();
		await this.tabs.playlists.waitForLoad();
	}
}
