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

	async getTrackTitle(): Promise<string> {
		const els = await this.allByAccessibilityPrefix('track-title-');
		if (els.length === 0) throw new Error('No track title found in context menu');
		return els[0].getText();
	}

	async tapArtist(): Promise<void> {
		const el = this.elementByID('artist-logo');
		await el.waitForDisplayed({ timeoutMsg: 'Artist logo not visible in context menu' });
		await el.click();
	}

	async tapAlbumRow(): Promise<void> {
		const row = await this.firstVisibleByAccessibilityPrefix('track-row-');
		await row.click();
	}

	async tapBackdrop(): Promise<void> {
		const backdrop = this.elementByID('track-context-backdrop');
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
