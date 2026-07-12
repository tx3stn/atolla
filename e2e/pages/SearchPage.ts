import { BasePage } from './Base';

export class SearchPage extends BasePage {
	private readonly view = 'search-bar';
	private readonly input = 'search-input';
	private readonly searchSubmit = 'search-submit';
	private readonly retryButton = 'search-retry';

	async waitForLoad(): Promise<void> {
		await this.elementByID(this.view).waitForDisplayed({
			timeoutMsg: 'Timed out waiting for search view',
		});
	}

	isVisible(): Promise<boolean> {
		return this.elementByID(this.view).isExisting();
	}

	async dismissKeyboard(): Promise<void> {
		if (this.isIOS()) {
			await this.elementByID(this.searchSubmit).click();
		} else {
			try {
				await this.driver.hideKeyboard();
			} catch {}
		}
	}

	async enterSearchQuery(query: string): Promise<void> {
		const input = this.elementByID(this.input);
		await input.waitForDisplayed({ timeoutMsg: 'Timed out waiting for search input' });
		await input.click();
		if (this.isAndroid()) {
			// mobile: type fires onChange/TextWatcher, unlike setValue which uses setText and bypasses the listener
			await input.clearValue();
			await this.driver.execute('mobile: type', { text: query });
		} else {
			await input.setValue(query);
		}
		const submit = this.elementByID(this.searchSubmit);
		await submit.waitForDisplayed({ timeoutMsg: 'Timed out waiting for search submit' });
		await submit.click();
	}

	async tapRetry(): Promise<void> {
		const el = this.elementByID(this.retryButton);
		await el.waitForDisplayed({ timeoutMsg: 'Timed out waiting for retry button' });
		await el.click();
	}

	async waitForAnyResultCard(): Promise<boolean> {
		await this.waitForVisibleAccessibilityPrefix('card-');
		return true;
	}

	async waitForTrackResults(): Promise<void> {
		await this.waitForVisibleAccessibilityPrefix('track-row-');
	}

	async openTrackContextMenuOnFirstVisibleTrackRow(): Promise<void> {
		await this.longPressFirstVisibleByAccessibilityPrefix('track-row-');
	}

	async waitForCardResults(): Promise<void> {
		await this.waitForVisibleAccessibilityPrefix('card-');
	}

	async longPressFirstVisibleCard(): Promise<void> {
		await this.longPressFirstVisibleByAccessibilityPrefix('card-');
	}
}
