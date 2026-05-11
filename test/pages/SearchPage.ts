import { BasePage, type PlatformLocator } from './Base';

export class SearchPage extends BasePage {
	private readonly locators = {
		albumsGrid: { android: '~search-albums-grid', ios: '//*[starts-with(@name, "card-album-")]' },
		artistsGrid: {
			android: '~search-artists-grid',
			ios: '//*[starts-with(@name, "card-artist-")]',
		},
		input: { android: '~search-input', ios: '~search-input' },
		playlistsGrid: {
			android: '~search-playlists-grid',
			ios: '//*[starts-with(@name, "card-playlist-")]',
		},
		// On iOS, <view> elements use XPath; <textfield> and <layout> use ~id
		retryButton: { android: '~search-retry', ios: '//XCUIElementTypeStaticText[@name="Retry"]/..' },
		root: { android: '~search-view', ios: '~search-input' },
		searchSubmit: { android: '~search-submit', ios: '//XCUIElementTypeImage[@name="search"]/..' },
	} satisfies Record<string, PlatformLocator>;

	async waitForLoad(): Promise<void> {
		await this.element(this.locators.root).waitForDisplayed({
			timeoutMsg: 'Timed out waiting for search view',
		});
		await this.element(this.locators.input).waitForDisplayed({
			timeoutMsg: 'Timed out waiting for search input',
		});
	}

	isVisible(): Promise<boolean> {
		return this.element(this.locators.root).isExisting();
	}

	async enterSearchQuery(query: string): Promise<void> {
		await this.element(this.locators.input).waitForDisplayed({
			timeoutMsg: 'Timed out waiting for search input',
		});
		await this.element(this.locators.input).click();
		if (this.platform() === 'android') {
			// mobile: type fires onChange/TextWatcher events (unlike setValue which uses setText
			// and bypasses the listener).
			await this.element(this.locators.input).clearValue();
			await this.driver.execute('mobile: type', { text: query });
		} else {
			await this.element(this.locators.input).setValue(query);
		}
		await this.element(this.locators.searchSubmit).waitForDisplayed({
			timeoutMsg: 'Timed out waiting for search submit',
		});
		await this.element(this.locators.searchSubmit).click();
	}

	async tapRetry(): Promise<void> {
		await this.element(this.locators.retryButton).waitForDisplayed({
			timeoutMsg: 'Timed out waiting for retry button',
		});
		await this.element(this.locators.retryButton).click();
	}

	// isExisting() is used instead of isDisplayed() because elements inside a ScrollView
	// on UIAutomator2 may report as not displayed even when fully visible on screen.
	// Checking the grid containers by existence is a reliable proxy for results being shown.
	async waitForAnyResultCard(): Promise<void> {
		await this.driver.waitUntil(
			async () =>
				(await this.element(this.locators.albumsGrid).isExisting()) ||
				(await this.element(this.locators.artistsGrid).isExisting()) ||
				(await this.element(this.locators.playlistsGrid).isExisting()),
			{ timeout: 15_000, timeoutMsg: 'Timed out waiting for search result cards to appear' },
		);
	}
}
