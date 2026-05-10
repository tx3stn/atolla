import type { Browser } from 'webdriverio';
import { BasePage, type PlatformLocator } from './Base';
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

	private readonly locators = {
		albumsHeaderTab: {
			android: '~header-tab-albums',
			ios: '//XCUIElementTypeStaticText[@name="ALBUMS"]/..',
		},
		artistsHeaderTab: {
			android: '~header-tab-artists',
			ios: '//XCUIElementTypeStaticText[@name="ARTISTS"]/..',
		},
		playlistsHeaderTab: {
			android: '~header-tab-playlists',
			ios: '//XCUIElementTypeStaticText[@name="PLAYLISTS"]/..',
		},
	} satisfies Record<string, PlatformLocator>;

	constructor(driver: Browser) {
		super(driver);
		this.tabs = {
			albums: new LibraryAlbumsTabPage(driver),
			artists: new LibraryArtistsTabPage(driver),
			playlists: new LibraryPlaylistsTabPage(driver),
		};
	}

	async openAlbumsTab(): Promise<void> {
		await this.element(this.locators.albumsHeaderTab).waitForDisplayed({
			timeoutMsg: 'Timed out waiting for albums header tab',
		});
		await this.element(this.locators.albumsHeaderTab).click();
		await this.tabs.albums.waitForLoad();
	}

	async openArtistsTab(): Promise<void> {
		await this.element(this.locators.artistsHeaderTab).waitForDisplayed({
			timeoutMsg: 'Timed out waiting for artists header tab',
		});
		await this.element(this.locators.artistsHeaderTab).click();
		await this.tabs.artists.waitForLoad();
	}

	async openPlaylistsTab(): Promise<void> {
		await this.element(this.locators.playlistsHeaderTab).waitForDisplayed({
			timeoutMsg: 'Timed out waiting for playlists header tab',
		});
		await this.element(this.locators.playlistsHeaderTab).click();
		await this.tabs.playlists.waitForLoad();
	}

	async waitForLoad(): Promise<void> {
		await this.element(this.locators.artistsHeaderTab).waitForDisplayed({
			timeoutMsg: 'Timed out waiting for artists header tab on library',
		});
		await this.element(this.locators.albumsHeaderTab).waitForDisplayed({
			timeoutMsg: 'Timed out waiting for albums header tab on library',
		});
		await this.element(this.locators.playlistsHeaderTab).waitForDisplayed({
			timeoutMsg: 'Timed out waiting for playlists header tab on library',
		});
	}
}
