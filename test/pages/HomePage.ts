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
		return await this.hasVisibleElementByID(this.albumsGrid);
	}

	async albumsTabIsVisible(): Promise<boolean> {
		return await this.elementByID(this.albumsTab).isDisplayed();
	}

	async artistGridIsVisible(): Promise<boolean> {
		return await this.hasVisibleElementByID(this.artistsGrid);
	}

	async playlistsGridIsVisible(): Promise<boolean> {
		return await this.hasVisibleElementByID(this.playlistsGrid);
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
		await this.waitForVisibleElementByID('card-album-27');
	}

	async waitForArtistsTab(): Promise<void> {
		await this.waitForVisibleElementByID(this.artistsGrid);
	}

	async waitForPlaylistsTab(): Promise<void> {
		await this.waitForVisibleElementByID(this.playlistsGrid);
	}

	async tapCardByID(cardID: string): Promise<void> {
		await this.elementByID(`card-${cardID}`).click();
	}

	async tapRandomCardByPrefix(prefix: string): Promise<void> {
		const candidates = this.driver.$$(
			`//*[starts-with(@name, "card-${prefix}") or starts-with(@content-desc, "card-${prefix}")]`,
		);
		const visibleCandidates: Array<WebdriverIO.Element> = [];

		for (const candidate of candidates) {
			if (await candidate.isDisplayed()) {
				visibleCandidates.push(candidate);
			}
		}

		if (visibleCandidates.length === 0) {
			throw new Error(`No visible cards found for prefix: ${prefix}`);
		}

		const randomIndex = Math.floor(Math.random() * visibleCandidates.length);
		await visibleCandidates[randomIndex].click();
	}

	async waitForLoad(): Promise<void> {
		await this.elementByID(this.artistsTab).waitForDisplayed();
		await this.elementByID(this.albumsTab).waitForDisplayed();
		await this.elementByID(this.playlistsTab).waitForDisplayed();
	}

	private async hasVisibleElementByID(id: string): Promise<boolean> {
		const element = this.elementByID(id);
		if (!(await element.isExisting())) {
			return false;
		}

		return await element.isDisplayed();
	}

	private async waitForVisibleElementByID(id: string): Promise<void> {
		await this.elementByID(id).waitForDisplayed({
			timeoutMsg: `Timed out waiting for visible element: ${id}`,
		});
	}
}
