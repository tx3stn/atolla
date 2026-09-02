import { BasePage } from './Base';
import { DetailHeaderPage } from './DetailHeaderPage';

export class ArtistDetailPage extends BasePage {
	private readonly root = 'artist-view';
	private readonly artistLogoText = 'detail-header-artist-logo-text';
	private readonly trackRowSwipeRegionPrefix = 'track-row-swipe-region-artist-top-track-';

	DetailHeader(): DetailHeaderPage {
		return new DetailHeaderPage(this.driver);
	}

	async waitForLoad(timeout = 10_000): Promise<void> {
		await this.elementByID(this.root).waitForDisplayed({
			timeout,
			timeoutMsg: 'Timed out waiting for artist view',
		});
	}

	// in the test environment artist images have no source, so the name renders as the logo fallback text
	async artistName(): Promise<string> {
		const el = this.elementByID(this.artistLogoText);
		await el.waitForExist({ timeoutMsg: 'Timed out waiting for artist name' });
		return (await el.getText()) ?? '';
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
