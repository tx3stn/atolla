import { BasePage } from './Base';

export class PlaylistDetailPage extends BasePage {
	private readonly root = 'playlist-view';

	async waitForLoad(): Promise<void> {
		await this.driver.waitUntil(async () => await this.elementByID(this.root).isExisting(), {
			timeoutMsg: 'timed out waiting for playlist view',
		});
	}
}
