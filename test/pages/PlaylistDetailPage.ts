import type { Browser } from 'webdriverio';
import { BasePage } from './Base';

export class PlaylistDetailPage extends BasePage {
	private readonly root: string;

	constructor(driver: Browser) {
		super(driver);
		this.root = 'playlist-view';
	}

	async waitForLoad(): Promise<void> {
		await this.elementByID(this.root).waitForDisplayed();
	}
}
