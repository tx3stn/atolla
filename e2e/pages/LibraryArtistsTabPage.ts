import { BasePage } from './Base';

export class LibraryArtistsTabPage extends BasePage {
	private readonly anyCardPrefix = 'card-';
	private readonly cardPrefix = 'card-artist-';

	async isVisible(): Promise<boolean> {
		return (await this.allByAccessibilityPrefix(this.cardPrefix)).length > 0;
	}

	async visibleCardIDs(): Promise<Array<string>> {
		const attribute = this.isIOS() ? 'name' : 'content-desc';
		const ids: Array<string> = [];
		for (const el of await this.allByAccessibilityPrefix(this.anyCardPrefix)) {
			const id = (await el.getAttribute(attribute)) ?? '';
			if (id.startsWith(this.anyCardPrefix)) {
				ids.push(id);
			}
		}
		return ids;
	}

	async waitForLoad(): Promise<void> {
		await this.waitForVisibleAccessibilityPrefix(this.cardPrefix);
	}

	async tapCardByID(artistId: string): Promise<void> {
		const el = this.elementByID(`card-${artistId}`);
		await el.waitForDisplayed({
			timeoutMsg: `Timed out waiting for artist card: card-${artistId}`,
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
