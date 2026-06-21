import { BasePage } from './Base';

export class HomePage extends BasePage {
	private readonly recentlyAddedGrid = 'home-recently-added-grid';
	private readonly albumCardPrefix = 'card-album-';
	private readonly shuffleLibraryMix = 'card-mix-shuffle-library';

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

	async longPressFirstVisibleAlbumCard(): Promise<void> {
		await this.longPressFirstVisibleByAccessibilityPrefix(this.albumCardPrefix);
	}

	// the mixes grid sits at the bottom of the home view, so scroll down until the card is on screen
	async tapShuffleLibraryMix(): Promise<void> {
		for (let attempt = 0; attempt < 8; attempt += 1) {
			const card = this.elementByID(this.shuffleLibraryMix);
			if ((await card.isExisting()) && (await card.isDisplayed().catch(() => false))) {
				await card.click();
				return;
			}
			await this.swipeUp(`home-scroll-${attempt}`);
		}
		throw new Error('Timed out finding shuffle library mix card');
	}

	private async swipeUp(id: string): Promise<void> {
		const rect = await this.driver.getWindowRect();
		const x = Math.floor(rect.width * 0.5);
		await this.driver.performActions([
			{
				actions: [
					{ duration: 0, type: 'pointerMove', x, y: Math.floor(rect.height * 0.75) },
					{ button: 0, type: 'pointerDown' },
					{ duration: 40, type: 'pause' },
					{ duration: 260, type: 'pointerMove', x, y: Math.floor(rect.height * 0.3) },
					{ button: 0, type: 'pointerUp' },
				],
				id,
				parameters: { pointerType: 'touch' },
				type: 'pointer',
			},
		]);
		await this.driver.releaseActions();
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
