import { BasePage } from './Base';

export class TrackContextMenu extends BasePage {
	private readonly root = 'track-context-menu';
	private readonly addToQueue = 'track-context-add-to-queue';
	private readonly playNext = 'track-context-play-next';

	async waitForVisible(): Promise<void> {
		await this.elementByID(this.root).waitForDisplayed({
			timeoutMsg: 'Track context menu not visible',
		});
	}

	async waitForHidden(): Promise<void> {
		await this.driver.waitUntil(async () => !(await this.elementByID(this.root).isExisting()), {
			timeoutMsg: 'Track context menu did not dismiss',
		});
	}

	async tapAddToQueue(): Promise<void> {
		const button = this.elementByID(this.addToQueue);
		await button.waitForDisplayed({ timeoutMsg: 'Add to queue button not visible' });
		await button.click();
		await this.dismissPermissionDialogIfPresent();
	}

	async tapPlayNext(): Promise<void> {
		const button = this.elementByID(this.playNext);
		await button.waitForDisplayed({ timeoutMsg: 'Play next button not visible' });
		await button.click();
		await this.dismissPermissionDialogIfPresent();
	}

	async tapBackdrop(): Promise<void> {
		const backdrop = this.elementByID('track-context-backdrop');
		await backdrop.waitForDisplayed({ timeoutMsg: 'Track context backdrop not visible' });
		await backdrop.click();
	}
}
