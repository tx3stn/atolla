import { BasePage } from './Base';

export class CardContextMenuPage extends BasePage {
	private readonly root = 'card-context-menu';
	private readonly backdrop = 'card-context-backdrop';
	private readonly play = 'card-context-play';
	private readonly playNext = 'card-context-play-next';
	private readonly addToQueue = 'card-context-add-to-queue';

	async waitForVisible(): Promise<void> {
		await this.elementByID(this.root).waitForDisplayed({
			timeoutMsg: 'Card context menu not visible',
		});
	}

	async waitForHidden(): Promise<void> {
		await this.driver.waitUntil(async () => !(await this.elementByID(this.root).isExisting()), {
			timeoutMsg: 'Card context menu did not dismiss',
		});
	}

	async tapBackdrop(): Promise<void> {
		const el = this.elementByID(this.backdrop);
		await el.waitForDisplayed({ timeoutMsg: 'Card context backdrop not visible' });
		await el.click();
	}

	async tapPlay(): Promise<void> {
		const el = this.elementByID(this.play);
		await el.waitForDisplayed({ timeoutMsg: 'Play button not visible' });
		await el.click();
		await this.dismissPermissionDialogIfPresent();
	}

	async tapPlayNext(): Promise<void> {
		const el = this.elementByID(this.playNext);
		await el.waitForDisplayed({ timeoutMsg: 'Play next button not visible' });
		await el.click();
		await this.dismissPermissionDialogIfPresent();
	}

	async tapAddToQueue(): Promise<void> {
		const el = this.elementByID(this.addToQueue);
		await el.waitForDisplayed({ timeoutMsg: 'Add to queue button not visible' });
		await el.click();
		await this.dismissPermissionDialogIfPresent();
	}
}
