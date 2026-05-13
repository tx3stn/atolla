import { BasePage, type PlatformLocator } from './Base';
import { DetailHeaderPage } from './DetailHeaderPage';

export class ArtistDetailPage extends BasePage {
	private readonly locators = {
		root: { android: '~artist-view', ios: '~artist-view' },
	} satisfies Record<string, PlatformLocator>;

	public DetailHeader(): DetailHeaderPage {
		return new DetailHeaderPage(this.driver);
	}

	async waitForLoad(): Promise<void> {
		await this.element(this.locators.root).waitForExist({
			timeoutMsg: 'Timed out waiting for artist view',
		});
	}
}
