import type { Browser } from 'webdriverio';
import { BasePage } from './Base';

export class SearchPage extends BasePage {
	private readonly input: string;
	private readonly root: string;
	private readonly retryButton: string;
	private readonly searchBar: string;
	private readonly searchSubmit: string;
	private readonly albumsGrid: string;
	private readonly artistsGrid: string;
	private readonly playlistsGrid: string;

	constructor(driver: Browser) {
		super(driver);
		this.input = 'search-input';
		this.root = 'search-view';
		this.retryButton = 'search-retry';
		this.searchBar = 'search-bar';
		this.searchSubmit = 'search-submit';
		this.albumsGrid = 'search-albums-grid';
		this.artistsGrid = 'search-artists-grid';
		this.playlistsGrid = 'search-playlists-grid';
	}

	async waitForLoad(): Promise<void> {
		await this.elementByID(this.root).waitForDisplayed();
		await this.elementByID(this.searchBar).waitForDisplayed();
		await this.elementByID(this.input).waitForDisplayed();
	}

	async isVisible(): Promise<boolean> {
		const root = this.elementByID(this.root);
		if (!(await root.isExisting())) {
			return false;
		}

		return await root.isDisplayed();
	}

	async enterSearchQuery(query: string): Promise<void> {
		await this.elementByID(this.input).waitForDisplayed();
		await this.elementByID(this.input).click();
		const isAndroid = (this.driver.capabilities.platformName as string).toLowerCase() === 'android';
		if (isAndroid) {
			// mobile: type fires onChange/TextWatcher events (unlike setValue which uses setText
			// and bypasses the listener).
			await this.elementByID(this.input).clearValue();
			await this.driver.execute('mobile: type', { text: query });
		} else {
			await this.elementByID(this.input).setValue(query);
		}
		await this.elementByID(this.searchSubmit).waitForDisplayed();
		await this.elementByID(this.searchSubmit).click();
	}

	async tapRetry(): Promise<void> {
		await this.elementByID(this.retryButton).waitForDisplayed();
		await this.elementByID(this.retryButton).click();
	}

	// isExisting() is used instead of isDisplayed() because elements inside a ScrollView
	// on UIAutomator2 may report as not displayed even when fully visible on screen.
	// Checking the grid containers by existence is a reliable proxy for results being shown.
	async waitForAnyResultCard(): Promise<void> {
		await this.driver.waitUntil(
			async () =>
				(await this.elementByID(this.albumsGrid).isExisting()) ||
				(await this.elementByID(this.artistsGrid).isExisting()) ||
				(await this.elementByID(this.playlistsGrid).isExisting()),
			{ timeout: 15_000, timeoutMsg: 'Timed out waiting for search result cards to appear' },
		);
	}
}
