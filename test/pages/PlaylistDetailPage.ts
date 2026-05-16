import type { Browser } from 'webdriverio';
import { BasePage } from './Base';
import { DetailHeaderPage } from './DetailHeaderPage';

export class PlaylistDetailPage extends BasePage {
	public readonly detailHeader: DetailHeaderPage;

	private readonly root = 'playlist-view';

	constructor(driver: Browser) {
		super(driver);
		this.detailHeader = new DetailHeaderPage(driver);
	}

	private readonly trackRowPrefix = 'track-row-';

	async waitForLoad(): Promise<void> {
		await this.elementByID(this.root).waitForExist({
			timeoutMsg: 'Timed out waiting for playlist view',
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
