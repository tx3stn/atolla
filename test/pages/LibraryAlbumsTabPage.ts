import { BasePage } from './Base';

export class LibraryAlbumsTabPage extends BasePage {
	private readonly cardPrefix = 'card-album-';

	async isVisible(): Promise<boolean> {
		return (await this.allByAccessibilityPrefix(this.cardPrefix)).length > 0;
	}

	async waitForLoad(): Promise<void> {
		await this.waitForVisibleAccessibilityPrefix(this.cardPrefix);
	}

	async tapCardByID(albumId: string): Promise<void> {
		const el = this.elementByID(`card-${albumId}`);
		await el.waitForDisplayed({ timeoutMsg: `Timed out waiting for album card: card-${albumId}` });
		await el.click();
	}

	async tapFirstVisibleCard(): Promise<void> {
		await this.tapFirstVisibleByAccessibilityPrefix(this.cardPrefix);
	}

	async longPressFirstVisibleCard(): Promise<void> {
		await this.longPressFirstVisibleByAccessibilityPrefix(this.cardPrefix);
	}
}
