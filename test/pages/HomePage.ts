import type { Browser } from 'webdriverio';
import { BasePage } from './Base';
import { HomeAlbumsTabPage } from './HomeAlbumsTabPage';
import { HomeArtistsTabPage } from './HomeArtistsTabPage';
import { HomePlaylistsTabPage } from './HomePlaylistsTabPage';

interface HomeTabs {
	albums: HomeAlbumsTabPage;
	artists: HomeArtistsTabPage;
	playlists: HomePlaylistsTabPage;
}

export class HomePage extends BasePage {
	public readonly tabs: HomeTabs;

	private readonly albumsHeaderTab = 'header-tab-albums';
	private readonly artistsHeaderTab = 'header-tab-artists';
	private readonly playlistsHeaderTab = 'header-tab-playlists';

	constructor(driver: Browser) {
		super(driver);
		this.tabs = {
			albums: new HomeAlbumsTabPage(driver),
			artists: new HomeArtistsTabPage(driver),
			playlists: new HomePlaylistsTabPage(driver),
		};
	}

	async openAlbumsTab(): Promise<void> {
		await this.elementByID(this.albumsHeaderTab).waitForDisplayed({
			timeoutMsg: 'Timed out waiting for albums header tab',
		});
		await this.elementByID(this.albumsHeaderTab).click();
		await this.tabs.albums.waitForLoad();
	}

	async openArtistsTab(): Promise<void> {
		await this.elementByID(this.artistsHeaderTab).waitForDisplayed({
			timeoutMsg: 'Timed out waiting for artists header tab',
		});
		await this.elementByID(this.artistsHeaderTab).click();
		await this.tabs.artists.waitForLoad();
	}

	async openPlaylistsTab(): Promise<void> {
		await this.elementByID(this.playlistsHeaderTab).waitForDisplayed({
			timeoutMsg: 'Timed out waiting for playlists header tab',
		});
		await this.elementByID(this.playlistsHeaderTab).click();
		await this.tabs.playlists.waitForLoad();
	}

	async waitForLoad(): Promise<void> {
		await this.elementByID(this.artistsHeaderTab).waitForDisplayed({
			timeoutMsg: 'Timed out waiting for artists header tab on home',
		});
		await this.elementByID(this.albumsHeaderTab).waitForDisplayed({
			timeoutMsg: 'Timed out waiting for albums header tab on home',
		});
		await this.elementByID(this.playlistsHeaderTab).waitForDisplayed({
			timeoutMsg: 'Timed out waiting for playlists header tab on home',
		});
	}
}
