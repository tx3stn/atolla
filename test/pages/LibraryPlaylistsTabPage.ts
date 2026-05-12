import { BasePage, type PlatformLocator } from './Base';

export class LibraryPlaylistsTabPage extends BasePage {
	private readonly locators = {
		grid: { android: '~library-playlists-grid', ios: '//*[@name="library-playlists-grid"]' },
	} satisfies Record<string, PlatformLocator>;

	private readonly cardPrefix = 'card-playlist-';

	isVisible(): Promise<boolean> {
		return this.element(this.locators.grid).isExisting();
	}

	async tapCardByID(playlistId: string): Promise<void> {
		await this.elementByID(`card-${playlistId}`).waitForDisplayed({
			timeoutMsg: `Timed out waiting for playlist card: card-${playlistId}`,
		});
		await this.elementByID(`card-${playlistId}`).click();
	}

	async tapFirstVisibleCard(): Promise<void> {
		await this.tapFirstVisibleByAccessibilityPrefix(this.cardPrefix);
	}

	async waitForLoad(): Promise<void> {
		await this.element(this.locators.grid).waitForExist({
			timeoutMsg: 'Timed out waiting for playlists grid',
		});
		await this.waitForVisibleAccessibilityPrefix(this.cardPrefix);
	}
}
