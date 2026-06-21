import { BasePage } from './Base';

export class CreatePlaylistFromQueueModal extends BasePage {
	private readonly root = 'create-playlist-from-queue-modal';
	private readonly nameInput = 'create-playlist-from-queue-name-input';
	private readonly includePlayed = 'create-playlist-from-queue-include-played';
	private readonly includeUpNext = 'create-playlist-from-queue-include-up-next';
	private readonly createButton = 'create-playlist-from-queue-create-btn';
	private readonly cancelButton = 'create-playlist-from-queue-cancel-btn';

	async waitForVisible(): Promise<void> {
		await this.elementByID(this.root).waitForDisplayed({
			timeoutMsg: 'Create playlist from queue modal not visible',
		});
	}

	async waitForHidden(timeout = 10_000): Promise<void> {
		await this.driver.waitUntil(async () => !(await this.elementByID(this.root).isExisting()), {
			timeout,
			timeoutMsg: 'Create playlist from queue modal did not dismiss',
		});
	}

	async enterName(name: string): Promise<void> {
		const input = this.elementByID(this.nameInput);
		await input.waitForDisplayed({ timeoutMsg: 'Timed out waiting for playlist name input' });
		await input.click();
		if (this.isAndroid()) {
			// mobile: type fires onChange, unlike setValue which bypasses the listener
			await input.clearValue();
			await this.driver.execute('mobile: type', { text: name });
		} else {
			await input.setValue(name);
		}
	}

	async toggleIncludePlayed(): Promise<void> {
		const el = this.elementByID(this.includePlayed);
		await el.waitForDisplayed({ timeoutMsg: 'Timed out waiting for include-played checkbox' });
		await el.click();
	}

	async toggleIncludeUpNext(): Promise<void> {
		const el = this.elementByID(this.includeUpNext);
		await el.waitForDisplayed({ timeoutMsg: 'Timed out waiting for include-up-next checkbox' });
		await el.click();
	}

	async tapCreate(): Promise<void> {
		const el = this.elementByID(this.createButton);
		await el.waitForDisplayed({ timeoutMsg: 'Timed out waiting for create button' });
		await el.click();
	}

	async tapCancel(): Promise<void> {
		const el = this.elementByID(this.cancelButton);
		await el.waitForDisplayed({ timeoutMsg: 'Timed out waiting for cancel button' });
		await el.click();
	}
}
