import type { Browser } from 'webdriverio';
import { BasePage } from './Base';

export class HomePage extends BasePage {
	private readonly albumsGrid: string;
	private readonly albumsTab: string;
	private readonly artistsGrid: string;
	private readonly artistsTab: string;
	private readonly playlistsGrid: string;
	private readonly playlistsTab: string;

	constructor(driver: Browser) {
		super(driver);
		this.albumsGrid = 'home-albums-grid';
		this.albumsTab = 'header-tab-albums';
		this.artistsGrid = 'home-artists-grid';
		this.artistsTab = 'header-tab-artists';
		this.playlistsGrid = 'home-playlists-grid';
		this.playlistsTab = 'header-tab-playlists';
	}

	async albumsGridIsVisible(): Promise<boolean> {
		return await this.elementByID(this.albumsGrid).isDisplayed();
	}

	async albumsTabIsVisible(): Promise<boolean> {
		return await this.elementByID(this.albumsTab).isDisplayed();
	}

	async artistGridIsVisible(): Promise<boolean> {
		return await this.elementByID(this.artistsGrid).isDisplayed();
	}

	async playlistsGridIsVisible(): Promise<boolean> {
		return await this.elementByID(this.playlistsGrid).isDisplayed();
	}

	async tapHeaderAlbums(): Promise<void> {
		await this.elementByID(this.albumsTab).click();
	}

	async tapHeaderArtists(): Promise<void> {
		await this.elementByID(this.artistsTab).click();
	}

	async tapHeaderPlaylists(): Promise<void> {
		await this.elementByID(this.playlistsTab).click();
	}

	async waitForAlbumsTab(): Promise<void> {
		await this.elementByID(this.albumsGrid).waitForDisplayed();
	}

	async waitForArtistsTab(): Promise<void> {
		await this.elementByID(this.artistsGrid).waitForDisplayed();
	}

	async waitForPlaylistsTab(): Promise<void> {
		await this.elementByID(this.playlistsGrid).waitForDisplayed();
	}

	async tapCardByID(cardID: string): Promise<void> {
		await this.elementByID(`card-${cardID}`).click();
	}

	async waitForLoad(): Promise<void> {
		await this.elementByID(this.artistsTab).waitForDisplayed();
		await this.elementByID(this.albumsTab).waitForDisplayed();
		await this.elementByID(this.playlistsTab).waitForDisplayed();
	}
}
