import { BasePage, type PlatformLocator } from './Base';

export class TrackContextMenu extends BasePage {
	private readonly locators = {
		addToQueue: { android: '~track-context-add-to-queue', ios: '~track-context-add-to-queue' },
		playNext: { android: '~track-context-play-next', ios: '~track-context-play-next' },
		root: { android: '~track-context-menu', ios: '~track-context-menu' },
	} satisfies Record<string, PlatformLocator>;

	async waitForVisible(): Promise<void> {
		await this.element(this.locators.root).waitForDisplayed({
			timeoutMsg: 'Track context menu not visible',
		});
	}

	async waitForHidden(): Promise<void> {
		await this.driver.waitUntil(
			async () => !(await this.element(this.locators.root).isExisting()),
			{ timeoutMsg: 'Track context menu did not dismiss' },
		);
	}

	async tapAddToQueue(): Promise<void> {
		const button = this.element(this.locators.addToQueue);
		await button.waitForDisplayed({ timeoutMsg: 'Add to queue button not visible' });
		await button.click();
		await this.dismissPermissionDialogIfPresent();
	}

	async tapPlayNext(): Promise<void> {
		const button = this.element(this.locators.playNext);
		await button.waitForDisplayed({ timeoutMsg: 'Play next button not visible' });
		await button.click();
		await this.dismissPermissionDialogIfPresent();
	}
}
