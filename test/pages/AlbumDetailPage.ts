import { BasePage, type PlatformLocator } from './Base';
import { DetailHeaderPage } from './DetailHeaderPage';

export class AlbumDetailPage extends BasePage {
	private readonly locators = {
		playAction: { android: '~detail-header-play-button', ios: '~detail-header-play-button' },
	} satisfies Record<string, PlatformLocator>;

	private readonly trackRowPrefix = 'track-row-';

	public DetailHeader(): DetailHeaderPage {
		return new DetailHeaderPage(this.driver);
	}

	async waitForLoad(): Promise<void> {
		await this.element(this.locators.playAction).waitForDisplayed({
			timeoutMsg: 'Timed out waiting for album detail play button',
		});
	}

	async tapPlayButton(): Promise<void> {
		const playButton = this.element(this.locators.playAction);
		await playButton.waitForDisplayed();
		await playButton.click();
		await this.dismissPermissionDialogIfPresent();
	}

	async openTrackContextMenuOnFirstVisibleRow(): Promise<void> {
		const firstVisibleRow = await this.firstVisibleTrackRow();
		await this.longPressElement(firstVisibleRow);
	}

	async firstVisibleTrackRowId(): Promise<string> {
		const firstVisibleRow = await this.firstVisibleTrackRow();

		const name = (await firstVisibleRow.getAttribute('name')) ?? '';
		if (name.startsWith(this.trackRowPrefix)) {
			return name;
		}

		const contentDesc = (await firstVisibleRow.getAttribute('content-desc')) ?? '';
		if (contentDesc.startsWith(this.trackRowPrefix)) {
			return contentDesc;
		}

		const resourceId = (await firstVisibleRow.getAttribute('resource-id')) ?? '';
		if (resourceId.startsWith(this.trackRowPrefix)) {
			return resourceId;
		}

		const resourceIdSuffix = `/${this.trackRowPrefix}`;
		const suffixIndex = resourceId.indexOf(resourceIdSuffix);
		if (suffixIndex !== -1) {
			return resourceId.slice(suffixIndex + 1);
		}

		throw new Error('Unable to determine first visible track row id');
	}

	async waitForTrackRowsVisible(): Promise<void> {
		await this.waitForLoad();

		await this.driver.waitUntil(
			async () => {
				for await (const row of this.driver.$$(
					`//*[starts-with(@name, "${this.trackRowPrefix}") or starts-with(@content-desc, "${this.trackRowPrefix}")]`,
				)) {
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

		for await (const row of this.driver.$$(
			`//*[starts-with(@name, "${this.trackRowPrefix}") or starts-with(@content-desc, "${this.trackRowPrefix}")]`,
		)) {
			if (await row.isDisplayed()) {
				return row;
			}
		}

		throw new Error('No visible track rows found inside album view');
	}
}
