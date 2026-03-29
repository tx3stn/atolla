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
		await this.elementByID(this.albumsHeaderTab).waitForDisplayed();
		await this.elementByID(this.albumsHeaderTab).click();
		await this.tabs.albums.waitForLoad();
	}

	async openArtistsTab(): Promise<void> {
		await this.elementByID(this.artistsHeaderTab).waitForDisplayed();
		await this.elementByID(this.artistsHeaderTab).click();
		await this.tabs.artists.waitForLoad();
	}

	async openPlaylistsTab(): Promise<void> {
		await this.elementByID(this.playlistsHeaderTab).waitForDisplayed();
		await this.elementByID(this.playlistsHeaderTab).click();
		await this.tabs.playlists.waitForLoad();
	}

	async waitForLoad(): Promise<void> {
		await this.elementByID(this.artistsHeaderTab).waitForDisplayed();
		await this.elementByID(this.albumsHeaderTab).waitForDisplayed();
		await this.elementByID(this.playlistsHeaderTab).waitForDisplayed();
	}
}
