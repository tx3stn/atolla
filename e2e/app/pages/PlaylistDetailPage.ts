import { BasePage } from './Base';
import { DetailHeaderPage } from './DetailHeaderPage';

export class PlaylistDetailPage extends BasePage {
	private readonly root = 'playlist-view';
	private readonly trackRowSwipeRegionPrefix = 'track-row-swipe-region-playlist-track-';
	private readonly trackTitlePrefix = 'track-title-playlist-track-';
	private readonly dragHandlePrefix = 'track-row-edit-handle-playlist-track-';

	DetailHeader(): DetailHeaderPage {
		return new DetailHeaderPage(this.driver);
	}

	async waitForLoad(): Promise<void> {
		await this.elementByID(this.root).waitForExist({
			timeoutMsg: 'Timed out waiting for playlist view',
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

	async visibleTrackTitles(): Promise<Array<string>> {
		const labels = await this.sortedByY(await this.allByAccessibilityPrefix(this.trackTitlePrefix));
		const titles: Array<string> = [];
		for (const label of labels) {
			titles.push(await label.getText());
		}
		return titles;
	}

	async reorderFirstRowBelowSecond(): Promise<void> {
		const handles = await this.sortedByY(
			await this.allByAccessibilityPrefix(this.dragHandlePrefix),
		);
		await this.dragFirstHandleBelowSecond(handles);
	}
}
