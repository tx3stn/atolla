import type { Browser } from 'webdriverio';
import { BasePage } from './Base';

export class NowPlayingFooterPage extends BasePage {
	private readonly next: string;
	private readonly previous: string;
	private readonly queuePageUpNext: string;
	private readonly queuePageBackTo: string;
	private readonly queueTrackRowPrefix: string;
	private readonly queueTabBackTo: string;
	private readonly queueTabUpNext: string;
	private readonly togglePlayback: string;
	private readonly bar: string;
	private activeTab: 'upNext' | 'backTo';

	constructor(driver: Browser) {
		super(driver);
		this.next = 'now-playing-next';
		this.previous = 'now-playing-previous';
		this.queuePageUpNext = 'now-playing-queue-page-up-next';
		this.queuePageBackTo = 'now-playing-queue-page-back-to';
		this.queueTrackRowPrefix = 'track-row-';
		this.queueTabBackTo = 'now-playing-tab-back-to';
		this.queueTabUpNext = 'now-playing-tab-up-next';
		this.togglePlayback = 'now-playing-play-pause';
		this.bar = 'now-playing-surface-bar';
		this.activeTab = 'upNext';
	}

	// Scoped to the active tab's page view only. Both page views exist in the tree
	// simultaneously (side-by-side slider), so we must restrict to the active one to
	// avoid picking up rows from the off-screen tab.
	private get queueRowsInListXPath(): string {
		const pageId = this.activeTab === 'upNext' ? this.queuePageUpNext : this.queuePageBackTo;
		return (
			`//*[@name="${pageId}" or @content-desc="${pageId}"]` +
			`//*[starts-with(@name, "${this.queueTrackRowPrefix}") or ` +
			`starts-with(@content-desc, "${this.queueTrackRowPrefix}")]`
		);
	}

	async waitForVisible(): Promise<void> {
		await this.elementByID(this.bar).waitForDisplayed();
	}

	async isVisible(): Promise<boolean> {
		const bar = this.elementByID(this.bar);
		if (!(await bar.isExisting())) {
			return false;
		}

		return await bar.isDisplayed();
	}

	async tapTogglePlayback(): Promise<void> {
		await this.elementByID(this.togglePlayback).waitForDisplayed();
		await this.elementByID(this.togglePlayback).click();
	}

	async tapNext(): Promise<void> {
		await this.elementByID(this.next).waitForDisplayed();
		await this.elementByID(this.next).click();
	}

	async openExpandedSurface(): Promise<void> {
		await this.elementByID(this.bar).waitForDisplayed();
		await this.elementByID(this.bar).click();
	}

	async tapPrevious(): Promise<void> {
		await this.elementByID(this.previous).waitForDisplayed();
		await this.elementByID(this.previous).click();
	}

	async tapUpNextTab(): Promise<void> {
		this.activeTab = 'upNext';
		await this.elementByID(this.queueTabUpNext).waitForDisplayed();
		await this.elementByID(this.queueTabUpNext).click();
	}

	async tapBackToTab(): Promise<void> {
		this.activeTab = 'backTo';
		await this.elementByID(this.queueTabBackTo).waitForDisplayed();
		await this.elementByID(this.queueTabBackTo).click();
	}

	async waitForQueueList(): Promise<void> {
		await this.scrollToQueueList();
		await this.driver.waitUntil(
			async () =>
				(await this.elementByID(this.queuePageUpNext).isExisting()) ||
				(await this.elementByID(this.queuePageBackTo).isExisting()),
			{ timeoutMsg: 'Timed out waiting for now playing queue list to exist' },
		);
	}

	// isExisting() is used instead of isDisplayed() because the page views live inside
	// a translated sliding strip — UIAutomator2 reports them as not displayed even when
	// fully on screen. Existence is a reliable proxy: elements are only in the tree when
	// the expanded surface is open.
	async isQueueListVisible(): Promise<boolean> {
		return (
			(await this.elementByID(this.queuePageUpNext).isExisting()) ||
			(await this.elementByID(this.queuePageBackTo).isExisting())
		);
	}

	async collapseExpandedIfVisible(): Promise<void> {
		if (!(await this.isQueueListVisible())) {
			return;
		}

		const rect = await this.driver.getWindowRect();
		const x = Math.floor(rect.width * 0.5);
		const startY = Math.floor(rect.height * 0.12);
		const endY = Math.floor(rect.height * 0.45);

		await this.driver.performActions([
			{
				actions: [
					{ duration: 0, type: 'pointerMove', x, y: startY },
					{ button: 0, type: 'pointerDown' },
					{ duration: 50, type: 'pause' },
					{ duration: 250, type: 'pointerMove', x, y: endY },
					{ button: 0, type: 'pointerUp' },
				],
				id: 'collapse-now-playing-finger',
				parameters: { pointerType: 'touch' },
				type: 'pointer',
			},
		]);
		await this.driver.releaseActions();

		await this.driver.waitUntil(async () => !(await this.isQueueListVisible()), {
			timeoutMsg: 'Timed out collapsing expanded now playing surface',
		});
	}

	async swipeAwayIfVisible(): Promise<void> {
		await this.collapseExpandedIfVisible();

		if (!(await this.isVisible())) {
			return;
		}

		const bar = this.elementByID(this.bar);
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
			},
		]);
		await this.driver.releaseActions();

		await this.driver.waitUntil(async () => !(await this.isVisible()), {
			timeoutMsg: 'Timed out swiping away now playing bar',
		});
	}

	// isExisting() is used instead of isDisplayed() for the same reason as
	// isQueueListVisible() — elements inside the sliding strip report as not displayed.
	async waitForQueueRowsVisible(): Promise<void> {
		await this.waitForQueueList();

		await this.driver.waitUntil(
			async () => {
				const rows = this.driver.$$(this.queueRowsInListXPath);
				return (await rows.length) > 0;
			},
			{ timeoutMsg: 'Timed out waiting for visible queue tracks' },
		);
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

	async firstVisibleQueueTrackRowId(): Promise<string> {
		await this.waitForQueueRowsVisible();
		const rows = this.driver.$$(this.queueRowsInListXPath);

		for (const row of rows) {
			const name = (await row.getAttribute('name')) ?? '';
			if (name.startsWith(this.queueTrackRowPrefix)) {
				return name;
			}

			const contentDesc = (await row.getAttribute('content-desc')) ?? '';
			if (contentDesc.startsWith(this.queueTrackRowPrefix)) {
				return contentDesc;
			}

			const resourceId = (await row.getAttribute('resource-id')) ?? '';
			if (resourceId.startsWith(this.queueTrackRowPrefix)) {
				return resourceId;
			}

			const resourceIdSuffix = `/${this.queueTrackRowPrefix}`;
			const suffixIndex = resourceId.indexOf(resourceIdSuffix);
			if (suffixIndex !== -1) {
				return resourceId.slice(suffixIndex + 1);
			}
		}

		throw new Error('No queue track rows found');
	}

	async countQueueRowsById(trackRowId: string): Promise<number> {
		await this.waitForQueueList();
		const targetId = this.normalizeTrackRowId(trackRowId);
		const rows = this.driver.$$(this.queueRowsInListXPath);

		let count = 0;
		for (const row of rows) {
			const rowId = await this.extractTrackRowId(row);
			if (rowId === targetId) {
				count += 1;
			}
		}

		return count;
	}

	private normalizeTrackRowId(trackRowId: string): string {
		if (trackRowId.startsWith(this.queueTrackRowPrefix)) {
			return trackRowId;
		}

		const resourceIdSuffix = `/${this.queueTrackRowPrefix}`;
		const suffixIndex = trackRowId.indexOf(resourceIdSuffix);
		if (suffixIndex !== -1) {
			return trackRowId.slice(suffixIndex + 1);
		}

		return `${this.queueTrackRowPrefix}${trackRowId}`;
	}

	private async extractTrackRowId(row: WebdriverIO.Element): Promise<string | null> {
		const name = (await row.getAttribute('name')) ?? '';
		if (name.startsWith(this.queueTrackRowPrefix)) {
			return name;
		}

		const contentDesc = (await row.getAttribute('content-desc')) ?? '';
		if (contentDesc.startsWith(this.queueTrackRowPrefix)) {
			return contentDesc;
		}

		const resourceId = (await row.getAttribute('resource-id')) ?? '';
		if (resourceId.startsWith(this.queueTrackRowPrefix)) {
			return resourceId;
		}

		const resourceIdSuffix = `/${this.queueTrackRowPrefix}`;
		const suffixIndex = resourceId.indexOf(resourceIdSuffix);
		if (suffixIndex !== -1) {
			return resourceId.slice(suffixIndex + 1);
		}

		return null;
	}
}
