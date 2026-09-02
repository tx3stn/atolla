import { BasePage } from './Base';
import { DetailHeaderPage } from './DetailHeaderPage';

export class GenreDetailPage extends BasePage {
	private readonly root = 'genre-view';
	private readonly trackRowSwipeRegionPrefix = 'track-row-swipe-region-genre-track-';

	DetailHeader(): DetailHeaderPage {
		return new DetailHeaderPage(this.driver);
	}

	async waitForLoad(): Promise<void> {
		try {
			await this.elementByID(this.root).waitForExist({ timeout: 2_000 });
		} catch {
			// on iOS this root accessibility node can be unreliable; track rows are the source of truth
		}
	}

	async waitForTrackRowsVisible(): Promise<void> {
		await this.waitForLoad();
		await this.waitForVisibleAccessibilityPrefix(this.trackRowSwipeRegionPrefix);
	}

	async openTrackContextMenuOnFirstVisibleRow(): Promise<void> {
		const row = await this.firstVisibleByAccessibilityPrefix(this.trackRowSwipeRegionPrefix);
		await this.longPressElement(row);
	}
}
