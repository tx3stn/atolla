import { BasePage } from './Base';

export class LibraryPlaylistsTabPage extends BasePage {
	private readonly cardPrefix = 'card-playlist-';

	async isVisible(): Promise<boolean> {
		return (await this.allByAccessibilityPrefix(this.cardPrefix)).length > 0;
	}

	async waitForLoad(): Promise<void> {
		await this.waitForVisibleAccessibilityPrefix(this.cardPrefix);
	}

	async tapCardByID(playlistId: string): Promise<void> {
		const el = this.elementByID(`card-${playlistId}`);
		await el.waitForDisplayed({
			timeoutMsg: `Timed out waiting for playlist card: card-${playlistId}`,
		});
		await el.click();
	}

	async tapFirstVisibleCard(): Promise<void> {
		await this.tapFirstVisibleByAccessibilityPrefix(this.cardPrefix);
	}

	async longPressFirstVisibleCard(): Promise<void> {
		await this.longPressFirstVisibleByAccessibilityPrefix(this.cardPrefix);
	}
}
