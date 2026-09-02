import { BasePage } from './Base';
import { DetailHeaderPage } from './DetailHeaderPage';

export class AlbumDetailPage extends BasePage {
	private readonly root = 'album-view';
	private readonly trackRowSwipeRegionPrefix = 'track-row-swipe-region-album-track-';
	private readonly trackTitlePrefix = 'track-title-album-track-';

	DetailHeader(): DetailHeaderPage {
		return new DetailHeaderPage(this.driver);
	}

	async waitForLoad(timeout = 10_000): Promise<void> {
		await this.elementByID(this.root).waitForDisplayed({
			timeout,
			timeoutMsg: 'Timed out waiting for album view',
		});
	}

	async waitForTrackRowsVisible(): Promise<void> {
		await this.waitForLoad();
		await this.waitForVisibleAccessibilityPrefix(this.trackRowSwipeRegionPrefix);
	}

	async trackTitles(): Promise<Array<string>> {
		await this.waitForVisibleAccessibilityPrefix(this.trackTitlePrefix);
		const titles: Array<string> = [];
		for (const el of await this.allByAccessibilityPrefix(this.trackTitlePrefix)) {
			titles.push(await el.getText());
		}
		return titles;
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
