import type { Browser } from 'webdriverio';
import { BasePage } from './Base';
import { DetailHeaderPage } from './DetailHeaderPage';

export class ArtistDetailPage extends BasePage {
	public readonly detailHeader: DetailHeaderPage;
	private readonly root = 'artist-view';
	private readonly trackRowSwipeRegionPrefix = 'track-row-swipe-region-artist-top-track-';

	constructor(driver: Browser) {
		super(driver);
		this.detailHeader = new DetailHeaderPage(driver);
	}

	async waitForLoad(): Promise<void> {
		await this.elementByID(this.root).waitForExist({
			timeoutMsg: 'Timed out waiting for artist view',
		});
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
