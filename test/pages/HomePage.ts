import { BasePage } from './Base';

export class HomePage extends BasePage {
	private readonly recentlyAddedGrid = 'home-recently-added-grid';
	private readonly albumCardPrefix = 'card-album-';

	isDisplayed(): Promise<boolean> {
		return this.elementByID(this.recentlyAddedGrid).isDisplayed();
	}

	async waitForLoad(): Promise<void> {
		await this.elementByID(this.recentlyAddedGrid).waitForExist({
			timeoutMsg: 'Timed out waiting for home view',
		});
	}

	async waitForAlbumCards(): Promise<void> {
		await this.waitForVisibleAccessibilityPrefix(this.albumCardPrefix);
	}

	async tapFirstVisibleAlbumCard(): Promise<void> {
		await this.tapFirstVisibleByAccessibilityPrefix(this.albumCardPrefix);
	}

	async pullToRefresh(): Promise<void> {
		const { width, height } = await this.driver.getWindowSize();
		const x = Math.round(width * 0.5);
		const startY = Math.round(height * 0.25);
		const endY = Math.round(height * 0.55);
		await this.driver.performActions([
			{
				actions: [
					{ duration: 0, type: 'pointerMove', x, y: startY },
					{ button: 0, type: 'pointerDown' },
					{ duration: 50, type: 'pause' },
					{ duration: 300, type: 'pointerMove', x, y: endY },
					{ button: 0, type: 'pointerUp' },
				],
				id: 'pull-to-refresh-finger',
				parameters: { pointerType: 'touch' },
				type: 'pointer',
			},
		]);
		await this.driver.releaseActions();
	}
}
