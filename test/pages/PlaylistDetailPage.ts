import { BasePage } from './Base';
import { DetailHeaderPage } from './DetailHeaderPage';

export class PlaylistDetailPage extends BasePage {
	private readonly root = 'playlist-view';

	public DetailHeader(): DetailHeaderPage {
		return new DetailHeaderPage(this.driver);
	}

	async waitForLoad(): Promise<void> {
		await this.driver.waitUntil(async () => await this.elementByID(this.root).isExisting(), {
			timeoutMsg: 'timed out waiting for playlist view',
		});
	}
}
