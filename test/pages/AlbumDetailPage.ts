import { BasePage } from './Base';
import { DetailHeaderPage } from './DetailHeaderPage';

export class AlbumDetailPage extends BasePage {
	private readonly root = 'album-view';
	private readonly trackRowSwipeRegionPrefix = 'track-row-swipe-region-album-track-';

	DetailHeader(): DetailHeaderPage {
		return new DetailHeaderPage(this.driver);
	}

	async waitForLoad(): Promise<void> {
		await this.elementByID(this.root).waitForExist({
			timeoutMsg: 'Timed out waiting for album view',
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

	async firstVisibleTrackRowId(): Promise<string> {
		const row = await this.firstVisibleByAccessibilityPrefix(this.trackRowSwipeRegionPrefix);
		const name = (await row.getAttribute('name')) ?? '';
		if (name.startsWith(this.trackRowSwipeRegionPrefix)) return name;
		const contentDesc = (await row.getAttribute('content-desc')) ?? '';
		if (contentDesc.startsWith(this.trackRowSwipeRegionPrefix)) return contentDesc;
		throw new Error('Unable to determine first visible track row id');
	}
}
