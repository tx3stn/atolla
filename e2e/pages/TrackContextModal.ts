import { BasePage } from './Base';

export class TrackContextMenu extends BasePage {
	private readonly root = 'track-context-menu';
	private readonly addToQueue = 'track-context-add-to-queue';
	private readonly playNext = 'track-context-play-next';
	private readonly artistLogo = 'artist-logo';
	private readonly backdrop = 'track-context-backdrop';
	private readonly trackRowSwipeRegionPrefix = 'track-row-swipe-region-';
	private readonly trackTitlePrefix = 'track-title-';

	async waitForVisible(): Promise<void> {
		await this.elementByID(this.root).waitForDisplayed({
			timeoutMsg: 'Track context menu not visible',
		});
	}

	async isDisplayed(): Promise<boolean> {
		return await this.elementByID(this.root).isDisplayed();
	}

	async dismissIfVisible(): Promise<void> {
		if (!(await this.elementByID(this.root).isExisting())) return;
		await this.tapBackdrop();
		await this.waitForHidden();
	}

	async waitForHidden(timeout = 10_000): Promise<void> {
		await this.driver.waitUntil(async () => !(await this.elementByID(this.root).isExisting()), {
			timeout,
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

	async getTrackTitle(): Promise<string> {
		const menu = this.elementByID(this.root);
		const els = await this.allByAccessibilityPrefixWithin(menu, this.trackTitlePrefix);
		if (els.length === 0) throw new Error('No track title found in context menu');
		return els[0].getText();
	}

	async tapArtist(): Promise<void> {
		const el = this.elementByID(this.artistLogo);
		await el.waitForDisplayed({ timeoutMsg: 'Artist logo not visible in context menu' });
		await el.click();
	}

	async tapAlbumRow(): Promise<void> {
		const menu = this.elementByID(this.root);
		const rows = await this.allByAccessibilityPrefixWithin(menu, this.trackRowSwipeRegionPrefix);
		if (rows.length === 0) throw new Error('No track row found in track context menu');
		await rows[0].click();
	}

	async tapBackdrop(): Promise<void> {
		const backdrop = this.elementByID(this.backdrop);
		await backdrop.waitForDisplayed({ timeoutMsg: 'Track context backdrop not visible' });

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
}
