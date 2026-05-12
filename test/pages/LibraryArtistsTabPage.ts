import { BasePage, type PlatformLocator } from './Base';

export class LibraryArtistsTabPage extends BasePage {
	private readonly locators = {
		grid: { android: '~library-artists-grid', ios: '//*[@name="library-artists-grid"]' },
	} satisfies Record<string, PlatformLocator>;

	private readonly cardPrefix = 'card-artist-';

	isVisible(): Promise<boolean> {
		return this.element(this.locators.grid).isExisting();
	}

	async tapCardByID(artistId: string): Promise<void> {
		await this.elementByID(`card-${artistId}`).waitForDisplayed({
			timeoutMsg: `Timed out waiting for artist card: card-${artistId}`,
		});
		await this.elementByID(`card-${artistId}`).click();
	}

	async tapFirstVisibleCard(): Promise<void> {
		await this.tapFirstVisibleByAccessibilityPrefix(this.cardPrefix);
	}

	async waitForLoad(): Promise<void> {
		await this.element(this.locators.grid).waitForExist({
			timeoutMsg: 'Timed out waiting for artists grid',
		});
		await this.waitForVisibleAccessibilityPrefix(this.cardPrefix);
	}
}
