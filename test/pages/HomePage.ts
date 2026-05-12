import { BasePage, type PlatformLocator } from './Base';

export class HomePage extends BasePage {
	private readonly locators = {
		recentlyAddedGrid: {
			android: '~home-recently-added-grid',
			ios: '//*[@name="home-recently-added-grid"]',
		},
	} satisfies Record<string, PlatformLocator>;

	private readonly albumCardPrefix = 'card-album-';

	isDisplayed(): Promise<boolean> {
		return this.element(this.locators.recentlyAddedGrid).isDisplayed();
	}

	async hasAlbumCards(timeout = 5_000): Promise<boolean> {
		try {
			await this.driver.waitUntil(
				async () => {
					for await (const el of this.driver.$$(
						`//*[starts-with(@name, "${this.albumCardPrefix}") or starts-with(@content-desc, "${this.albumCardPrefix}")]`,
					)) {
						if (await el.isDisplayed()) return true;
					}
					return false;
				},
				{ timeout },
			);
			return true;
		} catch {
			return false;
		}
	}

	async tapFirstVisibleAlbumCard(): Promise<void> {
		await this.tapFirstVisibleByAccessibilityPrefix(this.albumCardPrefix);
	}

	async waitForLoad(): Promise<void> {
		await this.element(this.locators.recentlyAddedGrid).waitForExist({
			timeoutMsg: 'Timed out waiting for home view',
		});
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
