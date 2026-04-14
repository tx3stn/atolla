import { BasePage } from './Base';

export class HomePage extends BasePage {
	private readonly homeView = 'home-view';
	private readonly albumCardPrefix = 'card-album-';

	async waitForLoad(): Promise<void> {
		await this.elementByID(this.homeView).waitForDisplayed({
			timeoutMsg: 'Timed out waiting for home view',
		});
	}

	async tapFirstVisibleAlbumCard(): Promise<void> {
		await this.tapFirstVisibleByAccessibilityPrefix(this.albumCardPrefix);
	}
}
