import { BasePage, type PlatformLocator } from './Base';

export class NowPlayingFooterPage extends BasePage {
	private readonly locators = {
		bar: { android: '~now-playing-surface-bar', ios: '~now-playing-surface-bar' },
		next: { android: '~now-playing-next', ios: '~now-playing-next' },
		previous: { android: '~now-playing-previous', ios: '~now-playing-previous' },
		queuePageBackTo: {
			android: '~now-playing-queue-page-back-to',
			ios: '~now-playing-queue-page-back-to',
		},
		queuePageUpNext: {
			android: '~now-playing-queue-page-up-next',
			ios: '~now-playing-queue-page-up-next',
		},
		queueTabBackTo: { android: '~now-playing-tab-back-to', ios: '~now-playing-tab-back-to' },
		queueTabUpNext: { android: '~now-playing-tab-up-next', ios: '~now-playing-tab-up-next' },
		togglePlayback: { android: '~now-playing-play-pause', ios: '~now-playing-play-pause' },
	} satisfies Record<string, PlatformLocator>;

	private readonly queueTrackRowPrefixUpNext = 'track-row-up-next-';
	private readonly queueTrackRowPrefixBackTo = 'track-row-back-to-';
	private activeTab: 'upNext' | 'backTo' = 'upNext';

	getUpNextTracks(): Promise<Array<WebdriverIO.Element>> {
		return this.allByAccessibilityPrefix(this.queueTrackRowPrefixUpNext);
	}

	getBackToTracks(): Promise<Array<WebdriverIO.Element>> {
		return this.allByAccessibilityPrefix(this.queueTrackRowPrefixBackTo);
	}

	async waitForQueueRowsVisible(): Promise<void> {
		await this.waitForQueueList();
		const prefix = this.activeTab === 'upNext' ? 'track-title-up-next-' : 'track-title-back-to-';
		await this.driver.waitUntil(
			async () => (await this.allByAccessibilityPrefix(prefix)).length > 0,
			{ timeoutMsg: 'Timed out waiting for visible queue tracks' },
		);
	}

	async waitForVisible(): Promise<void> {
		await this.element(this.locators.bar).waitForDisplayed({
			timeoutMsg: 'Timed out waiting for now playing bar',
		});
	}

	async isVisible(): Promise<boolean> {
		const el = this.element(this.locators.bar);
		return (await el.isExisting()) && (await el.isDisplayed());
	}

	async tapTogglePlayback(): Promise<void> {
		await this.element(this.locators.togglePlayback).waitForDisplayed({
			timeoutMsg: 'Timed out waiting for playback toggle',
		});
		await this.element(this.locators.togglePlayback).click();
	}

	async tapNext(): Promise<void> {
		await this.element(this.locators.next).waitForDisplayed({
			timeoutMsg: 'Timed out waiting for next button',
		});
		await this.element(this.locators.next).click();
	}

	async openExpandedSurface(): Promise<void> {
		await this.element(this.locators.bar).waitForDisplayed({
			timeoutMsg: 'Timed out waiting for now playing bar',
		});
		await this.element(this.locators.bar).click();
	}

	async tapPrevious(): Promise<void> {
		await this.element(this.locators.previous).waitForDisplayed({
			timeoutMsg: 'Timed out waiting for previous button',
		});
		await this.element(this.locators.previous).click();
	}

	async tapUpNextTab(): Promise<void> {
		this.activeTab = 'upNext';
		await this.swipeUpExpandedSurface();
		await this.element(this.locators.queueTabUpNext).waitForDisplayed({
			timeoutMsg: 'Timed out waiting for up next tab',
		});
		await this.element(this.locators.queueTabUpNext).click();
	}

	async tapBackToTab(): Promise<void> {
		this.activeTab = 'backTo';
		await this.swipeUpExpandedSurface();
		await this.element(this.locators.queueTabBackTo).waitForDisplayed({
			timeoutMsg: 'Timed out waiting for back to tab',
		});
		await this.element(this.locators.queueTabBackTo).click();
	}

	async waitForQueueList(): Promise<void> {
		if (await this.isQueueListVisible()) {
			return;
		}
		await this.scrollToQueueList();
		await this.driver.waitUntil(
			async () =>
				(await this.element(this.locators.queuePageUpNext).isExisting()) ||
				(await this.element(this.locators.queuePageBackTo).isExisting()),
			{ timeoutMsg: 'Timed out waiting for now playing queue list to exist' },
		);
	}

	// isExisting() is used instead of isDisplayed() because the page views live inside
	// a translated sliding strip — UIAutomator2 reports them as not displayed even when
	// fully on screen. Existence is a reliable proxy: elements are only in the tree when
	// the expanded surface is open.
	async isQueueListVisible(): Promise<boolean> {
		return (
			(await this.element(this.locators.queuePageUpNext).isExisting()) ||
			(await this.element(this.locators.queuePageBackTo).isExisting())
		);
	}

	async collapseExpandedIfVisible(): Promise<void> {
		if (!(await this.isQueueListVisible())) {
			return;
		}

		// Scroll back to top so the artwork drag zone is under the collapse swipe
		const rect = await this.driver.getWindowRect();
		const x = Math.floor(rect.width * 0.5);
		await this.driver.performActions([
			{
				actions: [
					{ duration: 0, type: 'pointerMove', x, y: Math.floor(rect.height * 0.28) },
					{ button: 0, type: 'pointerDown' },
					{ duration: 40, type: 'pause' },
					{ duration: 260, type: 'pointerMove', x, y: Math.floor(rect.height * 0.78) },
					{ button: 0, type: 'pointerUp' },
				],
				id: 'scroll-to-top-finger',
				parameters: { pointerType: 'touch' },
				type: 'pointer',
			},
		]);
		await this.driver.releaseActions();

		const startY = Math.floor(rect.height * 0.12);
		const endY = Math.floor(rect.height * 0.45);

		for (let attempt = 0; attempt < 5; attempt += 1) {
			await this.driver.performActions([
				{
					actions: [
						{ duration: 0, type: 'pointerMove', x, y: startY },
						{ button: 0, type: 'pointerDown' },
						{ duration: 50, type: 'pause' },
						{ duration: 250, type: 'pointerMove', x, y: endY },
						{ button: 0, type: 'pointerUp' },
					],
					id: `collapse-now-playing-finger-${attempt}`,
					parameters: { pointerType: 'touch' },
					type: 'pointer',
				},
			]);
			await this.driver.releaseActions();

			if (!(await this.isQueueListVisible())) {
				return;
			}
		}

		throw new Error('Timed out collapsing expanded now playing surface');
	}

	async swipeAwayIfVisible(): Promise<void> {
		await this.collapseExpandedIfVisible();

		if (!(await this.isVisible())) {
			return;
		}

		const bar = this.element(this.locators.bar);
		await bar.waitForDisplayed();
		const location = await bar.getLocation();
		const size = await bar.getSize();
		const y = Math.floor(location.y + size.height * 0.5);
		const startX = Math.floor(location.x + size.width * 0.8);
		const endX = Math.floor(location.x + size.width * 0.1);

		await this.driver.performActions([
			{
				actions: [
					{ duration: 0, type: 'pointerMove', x: startX, y },
					{ button: 0, type: 'pointerDown' },
					{ duration: 50, type: 'pause' },
					{ duration: 250, type: 'pointerMove', x: endX, y },
					{ button: 0, type: 'pointerUp' },
				],
				id: 'dismiss-now-playing-finger',
				parameters: { pointerType: 'touch' },
				type: 'pointer',
			},
		]);
		await this.driver.releaseActions();

		await this.driver.waitUntil(async () => !(await this.isVisible()), {
			timeoutMsg: 'Timed out swiping away now playing bar',
		});
	}

	// Unconditional swipe-up to push the expanded surface fully above the footer nav bar,
	// ensuring tab buttons are not intercepted by the footer before we tap them.
	private async swipeUpExpandedSurface(): Promise<void> {
		const rect = await this.driver.getWindowRect();
		const x = Math.floor(rect.width * 0.5);
		const startY = Math.floor(rect.height * 0.78);
		const endY = Math.floor(rect.height * 0.28);

		await this.driver.performActions([
			{
				actions: [
					{ duration: 0, type: 'pointerMove', x, y: startY },
					{ button: 0, type: 'pointerDown' },
					{ duration: 40, type: 'pause' },
					{ duration: 260, type: 'pointerMove', x, y: endY },
					{ button: 0, type: 'pointerUp' },
				],
				id: 'expand-now-playing-finger',
				parameters: { pointerType: 'touch' },
				type: 'pointer',
			},
		]);
		await this.driver.releaseActions();
	}

	private async scrollToQueueList(maxSwipes = 6): Promise<void> {
		if (await this.isQueueListVisible()) {
			return;
		}

		for (let attempt = 0; attempt < maxSwipes; attempt += 1) {
			const rect = await this.driver.getWindowRect();
			const x = Math.floor(rect.width * 0.5);
			const startY = Math.floor(rect.height * 0.78);
			const endY = Math.floor(rect.height * 0.28);

			await this.driver.performActions([
				{
					actions: [
						{ duration: 0, type: 'pointerMove', x, y: startY },
						{ button: 0, type: 'pointerDown' },
						{ duration: 40, type: 'pause' },
						{ duration: 260, type: 'pointerMove', x, y: endY },
						{ button: 0, type: 'pointerUp' },
					],
					id: `queue-scroll-finger-${attempt}`,
					parameters: { pointerType: 'touch' },
					type: 'pointer',
				},
			]);
			await this.driver.releaseActions();

			if (await this.isQueueListVisible()) {
				return;
			}
		}
	}

	async firstUpNextTrackName(): Promise<string> {
		await this.waitForQueueRowsVisible();
		for (const el of await this.allByAccessibilityPrefix('track-title-up-next-')) {
			const text = await el.getText();
			if (text) return text;
		}
		throw new Error('No up next track titles found');
	}

	async firstBackToTrackName(): Promise<string> {
		await this.waitForQueueRowsVisible();
		for (const el of await this.allByAccessibilityPrefix('track-title-back-to-')) {
			const text = await el.getText();
			if (text) return text;
		}
		throw new Error('No back to track titles found');
	}
}
