import type { Browser } from 'webdriverio';
import { BasePage } from './Base';

export class AlbumDetailPage extends BasePage {
	private readonly playAction: string;
	private readonly trackRowPrefix: string;

	constructor(driver: Browser) {
		super(driver);
		this.playAction = 'detail-header-play-button';
		this.trackRowPrefix = 'track-row-';
	}

	async waitForLoad(): Promise<void> {
		await this.elementByID(this.playAction).waitForDisplayed({
			timeoutMsg: 'Timed out waiting for album detail play button',
		});
	}

	async tapPlayButton(): Promise<void> {
		await this.elementByID(this.playAction).waitForDisplayed();
		await this.elementByID(this.playAction).click();
	}

	async openTrackContextMenuOnFirstVisibleRow(): Promise<void> {
		const firstVisibleRow = await this.firstVisibleTrackRow();
		await this.longPressElement(firstVisibleRow);
	}

	async waitForTrackRowsVisible(): Promise<void> {
		await this.waitForLoad();

		await this.driver.waitUntil(
			async () => {
				const rows = await this.driver.$$(
					`//*[starts-with(@name, "${this.trackRowPrefix}") or starts-with(@content-desc, "${this.trackRowPrefix}")]`,
				);
				for (const row of rows) {
					if (await row.isDisplayed()) {
						return true;
					}
				}

				return false;
			},
			{ timeoutMsg: 'Timed out waiting for visible album track rows' },
		);
	}

	private async firstVisibleTrackRow(): Promise<WebdriverIO.Element> {
		await this.waitForTrackRowsVisible();
		const rows = await this.driver.$$(
			`//*[starts-with(@name, "${this.trackRowPrefix}") or starts-with(@content-desc, "${this.trackRowPrefix}")]`,
		);

		for (const row of rows) {
			if (await row.isDisplayed()) {
				return row;
			}
		}

		throw new Error('No visible track rows found inside album view');
	}
}
