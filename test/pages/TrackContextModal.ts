import type { Browser } from 'webdriverio';
import { BasePage } from './Base';

export class TrackContextMenu extends BasePage {
	private readonly root: string;
	private readonly addToQueue: string;
	private readonly playNext: string;

	constructor(driver: Browser) {
		super(driver);

		this.root = 'track-context-menu';
		this.addToQueue = 'track-context-add-to-queue';
		this.playNext = 'track-context-play-next';
	}

	async waitForVisible(): Promise<void> {
		await this.elementByID(this.root).waitForDisplayed({
			timeoutMsg: 'Track context menu not visible',
		});
	}

	async waitForHidden(): Promise<void> {
		await this.driver.waitUntil(
			async () => {
				const root = this.elementByID(this.root);
				if (!(await root.isExisting())) {
					return true;
				}

				return !(await root.isDisplayed());
			},
			{ timeoutMsg: 'Track context menu did not dismiss' },
		);
	}

	async tapAddToQueue(): Promise<void> {
		const button = this.elementByID(this.addToQueue);
		await button.waitForDisplayed({ timeoutMsg: 'Add to queue button not displayed' });
		await button.click();
	}

	async tapPlayNext(): Promise<void> {
		const button = this.elementByID(this.playNext);
		await button.waitForDisplayed({ timeoutMsg: 'Play next button not displayed' });
		await button.click();
	}
}
