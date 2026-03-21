import type { Browser } from 'webdriverio';
import { BasePage } from './Base';

export class AlbumDetailPage extends BasePage {
	private readonly root: string;

	constructor(driver: Browser) {
		super(driver);
		this.root = 'album-view';
	}

	async waitForLoad(): Promise<void> {
		await this.elementByID(this.root).waitForDisplayed();
	}
}
