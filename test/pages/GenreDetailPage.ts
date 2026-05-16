import { BasePage } from './Base';

export class GenreDetailPage extends BasePage {
	private readonly root = 'genre-view';
	private readonly trackRowPrefix = 'track-row-';

	async waitForLoad(): Promise<void> {
		await this.elementByID(this.root).waitForExist({
			timeoutMsg: 'Timed out waiting for genre view',
		});
	}

	async waitForTrackRowsVisible(): Promise<void> {
		await this.waitForLoad();
		await this.waitForVisibleAccessibilityPrefix(this.trackRowPrefix);
	}

	async openTrackContextMenuOnFirstVisibleRow(): Promise<void> {
		const row = await this.firstVisibleByAccessibilityPrefix(this.trackRowPrefix);
		await this.longPressElement(row);
	}
}
