import type { Browser } from 'webdriverio';
import { BasePage } from './Base';

export class AlbumDetailPage extends BasePage {
	private readonly addToQueueAction: string;
	private readonly contextMenu: string;
	private readonly playAction: string;
	private readonly playNextAction: string;
	private readonly trackRowPrefix: string;

	constructor(driver: Browser) {
		super(driver);
		this.addToQueueAction = 'track-context-add-to-queue';
		this.contextMenu = 'track-context-menu';
		this.playAction = 'detail-header-play-button';
		this.playNextAction = 'track-context-play-next';
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
		await this.waitForTrackContextMenuVisible();
	}

	async waitForTrackContextMenuVisible(): Promise<void> {
		await this.elementByID(this.contextMenu).waitForDisplayed();
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

	async tapTrackAddToQueueAction(): Promise<void> {
		const menu = this.elementByID(this.contextMenu);
		await menu.waitForDisplayed();
		const action = menu.$(`~${this.addToQueueAction}`);
		await action.waitForDisplayed();
		await action.click();
	}

	async tapTrackPlayNextAction(): Promise<void> {
		const menu = this.elementByID(this.contextMenu);
		await menu.waitForDisplayed();
		const action = menu.$(`~${this.playNextAction}`);
		await action.waitForDisplayed();
		await action.click();
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
