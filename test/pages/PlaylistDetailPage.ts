import { BasePage, type PlatformLocator } from './Base';
import { DetailHeaderPage } from './DetailHeaderPage';

export class PlaylistDetailPage extends BasePage {
	private readonly locators = {
		root: { android: '~playlist-view', ios: '//XCUIElementTypeImage[@name="play"]/..' },
	} satisfies Record<string, PlatformLocator>;

	public DetailHeader(): DetailHeaderPage {
		return new DetailHeaderPage(this.driver);
	}

	async waitForLoad(): Promise<void> {
		await this.element(this.locators.root).waitForExist({
			timeoutMsg: 'timed out waiting for playlist view',
		});
	}
}
