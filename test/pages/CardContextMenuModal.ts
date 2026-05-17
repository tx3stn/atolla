import { BasePage } from './Base';

export class CardContextMenu extends BasePage {
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
		const backdrop = this.elementByID(this.backdrop);
		await backdrop.waitForDisplayed({ timeoutMsg: 'Card context backdrop not visible' });
		if (this.isIOS()) {
			await backdrop.click();
			return;
		}
		const location = await backdrop.getLocation();
		const size = await backdrop.getSize();
		await this.driver.performActions([
			{
				actions: [
					{
						duration: 0,
						type: 'pointerMove',
						x: Math.floor(location.x + size.width / 2),
						y: Math.floor(location.y + 10),
					},
					{ button: 0, type: 'pointerDown' },
					{ duration: 50, type: 'pause' },
					{ button: 0, type: 'pointerUp' },
				],
				id: 'tap-backdrop',
				parameters: { pointerType: 'touch' },
				type: 'pointer',
			},
		]);
		await this.driver.releaseActions();
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
