import type { Browser } from 'webdriverio';
import { BasePage } from './Base';
import { DetailHeaderPage } from './DetailHeaderPage';

export class ArtistDetailPage extends BasePage {
	public readonly detailHeader: DetailHeaderPage;

	private readonly root = 'artist-view';

	constructor(driver: Browser) {
		super(driver);
		this.detailHeader = new DetailHeaderPage(driver);
	}

	async waitForLoad(): Promise<void> {
		await this.elementByID(this.root).waitForExist({
			timeoutMsg: 'Timed out waiting for artist view',
		});
	}
}
