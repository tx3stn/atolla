import { BasePage } from './Base';
import { DetailHeaderPage } from './DetailHeaderPage';

export class AlbumDetailPage extends BasePage {
	private readonly root = 'album-view';
	private readonly playAction = 'detail-header-play-button';
	private readonly trackRowPrefix = 'track-row-';

	DetailHeader(): DetailHeaderPage {
		return new DetailHeaderPage(this.driver);
	}

	async waitForLoad(): Promise<void> {
		await this.elementByID(this.root).waitForExist({
			timeoutMsg: 'Timed out waiting for album view',
		});
	}

	async tapPlayButton(): Promise<void> {
		const el = this.elementByID(this.playAction);
		await el.waitForDisplayed();
		await el.click();
		await this.dismissPermissionDialogIfPresent();
	}

	async waitForTrackRowsVisible(): Promise<void> {
		await this.waitForLoad();
		await this.waitForVisibleAccessibilityPrefix(this.trackRowPrefix);
	}

	async openTrackContextMenuOnFirstVisibleRow(): Promise<void> {
		const row = await this.firstVisibleByAccessibilityPrefix(this.trackRowPrefix);
		await this.longPressElement(row);
	}

	async firstVisibleTrackRowId(): Promise<string> {
		const row = await this.firstVisibleByAccessibilityPrefix(this.trackRowPrefix);
		const name = (await row.getAttribute('name')) ?? '';
		if (name.startsWith(this.trackRowPrefix)) return name;
		const contentDesc = (await row.getAttribute('content-desc')) ?? '';
		if (contentDesc.startsWith(this.trackRowPrefix)) return contentDesc;
		throw new Error('Unable to determine first visible track row id');
	}
}
