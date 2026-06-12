import { BasePage } from './Base';

export class NowPlayingBar extends BasePage {
	private readonly bar = 'now-playing-surface-bar';
	private readonly trackName = 'now-playing-track-name';
	private readonly progress = 'now-playing-progress';
	private readonly togglePlayback = 'now-playing-play-pause';
	private readonly next = 'now-playing-next';
	private readonly previous = 'now-playing-previous';
	private readonly queueTabUpNext = 'now-playing-tab-up-next';
	private readonly queueTabBackTo = 'now-playing-tab-back-to';
	private readonly queuePageUpNext = 'now-playing-queue-page-up-next';
	private readonly queuePageBackTo = 'now-playing-queue-page-back-to';

	private readonly trackTitleUpNextPrefix = 'track-title-up-next-';
	private readonly trackTitleBackToPrefix = 'track-title-back-to-';
	private readonly trackRowUpNextPrefix = 'track-row-up-next-';
	private readonly trackRowBackToPrefix = 'track-row-back-to-';
	private readonly trackHandleUpNextPrefix = 'track-row-edit-handle-up-next-';

	private activeTab: 'upNext' | 'backTo' = 'upNext';

	getUpNextTracks(): Promise<Array<WebdriverIO.Element>> {
		return this.allByAccessibilityPrefix(this.trackRowUpNextPrefix);
	}

	getBackToTracks(): Promise<Array<WebdriverIO.Element>> {
		return this.allByAccessibilityPrefix(this.trackRowBackToPrefix);
	}

	async currentTrackName(): Promise<string> {
		const el = this.elementByID(this.trackName);
		await el.waitForExist({ timeoutMsg: 'Timed out waiting for track name' });
		return (await el.getText()) ?? '';
	}

	// Taps the progress bar at 92% of its width to seek near the end of the track.
	// Requires the expanded surface to be open (the progress bar is only rendered there).
	async seekToNearEnd(): Promise<void> {
		const el = this.elementByID(this.progress);
		await el.waitForDisplayed({ timeoutMsg: 'Timed out waiting for progress bar' });
		const location = await el.getLocation();
		const size = await el.getSize();
		const x = Math.floor(location.x + size.width * 0.92);
		const y = Math.floor(location.y + size.height * 0.5);
		await this.driver.performActions([
			{
				actions: [
					{ duration: 0, type: 'pointerMove', x, y },
					{ button: 0, type: 'pointerDown' },
					{ duration: 50, type: 'pause' },
					{ button: 0, type: 'pointerUp' },
				],
				id: 'seek-near-end-finger',
				parameters: { pointerType: 'touch' },
				type: 'pointer',
			},
		]);
		await this.driver.releaseActions();
	}

	async waitForVisible(): Promise<void> {
		await this.elementByID(this.bar).waitForDisplayed({
			timeoutMsg: 'Timed out waiting for now playing bar',
		});
	}

	async isVisible(): Promise<boolean> {
		const el = this.elementByID(this.bar);
		return (await el.isExisting()) && (await el.isDisplayed());
	}

	async openExpandedSurface(): Promise<void> {
		const el = this.elementByID(this.bar);
		await el.waitForDisplayed({ timeoutMsg: 'Timed out waiting for now playing bar' });

		// Tapping the collapsed bar kicks off a ~0.4s expand animation. Returning before it
		// settles is the cold-start flake: the expanded overlay — and its queue tab — is still
		// parked off-screen by the footer (collapsed overlay top:2000), so the later tab tap
		// lands on the footer nav (search) instead. Confirm the surface genuinely expanded via
		// queue-page existence (the reliable expanded signal — isDisplayed lies at alpha 0),
		// re-tapping if the gesture was dropped. Re-tapping while already expanded is a no-op.
		for (let attempt = 0; attempt < 4; attempt += 1) {
			if (await this.isQueueListVisible()) return;
			await el.click();
			try {
				await this.driver.waitUntil(async () => this.isQueueListVisible(), {
					timeout: 4000,
					timeoutMsg: '',
				});
				return;
			} catch {
				// Expand gesture dropped (cold start under load) — re-tap and retry.
			}
		}

		throw new Error('Timed out expanding now playing surface');
	}

	async tapTogglePlayback(): Promise<void> {
		const el = this.elementByID(this.togglePlayback);
		await el.waitForDisplayed({ timeoutMsg: 'Timed out waiting for playback toggle' });
		await el.click();
	}

	async tapNext(): Promise<void> {
		const el = this.elementByID(this.next);
		await el.waitForDisplayed({ timeoutMsg: 'Timed out waiting for next button' });
		await el.click();
	}

	async tapPrevious(): Promise<void> {
		const el = this.elementByID(this.previous);
		await el.waitForDisplayed({ timeoutMsg: 'Timed out waiting for previous button' });
		await el.click();
	}

	async tapUpNextTab(): Promise<void> {
		this.activeTab = 'upNext';
		await this.swipeUpSurface('expand-for-up-next-tab');
		const el = this.elementByID(this.queueTabUpNext);
		await el.waitForDisplayed({ timeoutMsg: 'Timed out waiting for up next tab' });
		await el.click();
		await this.elementByID(this.queuePageUpNext).waitForExist({
			timeoutMsg: 'Timed out waiting for up next queue page to appear',
		});
	}

	async tapBackToTab(): Promise<void> {
		this.activeTab = 'backTo';
		await this.swipeUpSurface('expand-for-back-to-tab');
		const el = this.elementByID(this.queueTabBackTo);
		await el.waitForDisplayed({ timeoutMsg: 'Timed out waiting for back to tab' });
		await el.click();
		await this.elementByID(this.queuePageBackTo).waitForExist({
			timeoutMsg: 'Timed out waiting for back to queue page to appear',
		});
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

	async waitForQueueList(): Promise<void> {
		if (await this.isQueueListVisible()) return;
		await this.scrollToQueueList();
		await this.driver.waitUntil(
			async () =>
				(await this.elementByID(this.queuePageUpNext).isExisting()) ||
				(await this.elementByID(this.queuePageBackTo).isExisting()),
			{ timeoutMsg: 'Timed out waiting for now playing queue list to exist' },
		);
	}

	async waitForQueueRowsVisible(): Promise<void> {
		await this.waitForQueueList();
		const prefix =
			this.activeTab === 'upNext' ? this.trackTitleUpNextPrefix : this.trackTitleBackToPrefix;
		await this.driver.waitUntil(
			async () => (await this.allByAccessibilityPrefix(prefix)).length > 0,
			{ timeoutMsg: 'Timed out waiting for visible queue tracks' },
		);
	}

	async firstUpNextTrackName(): Promise<string> {
		await this.waitForQueueRowsVisible();
		for (const el of await this.allByAccessibilityPrefix(this.trackTitleUpNextPrefix)) {
			const text = await el.getText();
			if (text) return text;
		}
		throw new Error('No up next track titles found');
	}

	async lastUpNextTrackName(): Promise<string> {
		await this.waitForQueueRowsVisible();
		const els = await this.allByAccessibilityPrefix(this.trackTitleUpNextPrefix);
		for (let i = els.length - 1; i >= 0; i--) {
			const text = await els[i].getText();
			if (text) return text;
		}
		throw new Error('No up next track titles found');
	}

	async upNextTrackNames(): Promise<Array<string>> {
		await this.waitForQueueRowsVisible();
		const labels = await this.sortedByY(
			await this.allByAccessibilityPrefix(this.trackTitleUpNextPrefix),
		);
		const names: Array<string> = [];
		for (const label of labels) {
			names.push(await label.getText());
		}
		return names;
	}

	async reorderFirstUpNextRowBelowSecond(): Promise<void> {
		await this.waitForQueueRowsVisible();
		const handles = await this.sortedByY(
			await this.allByAccessibilityPrefix(this.trackHandleUpNextPrefix),
		);
		await this.dragFirstHandleBelowSecond(handles);
	}

	async firstBackToTrackName(): Promise<string> {
		await this.waitForQueueRowsVisible();
		for (const el of await this.allByAccessibilityPrefix(this.trackTitleBackToPrefix)) {
			const text = await el.getText();
			if (text) return text;
		}
		throw new Error('No back to track titles found');
	}

	async tapFirstBackToRow(): Promise<void> {
		await this.waitForQueueRowsVisible();
		const rows = await this.sortedByY(
			await this.allByAccessibilityPrefix(this.trackRowBackToPrefix),
		);
		if (rows.length === 0) {
			throw new Error('No back to rows to tap');
		}
		await rows[0].click();
	}

	async collapseExpandedIfVisible(): Promise<void> {
		if (!(await this.isQueueListVisible())) return;

		// Scroll back to top so the artwork drag zone is under the collapse swipe
		await this.swipeVertical('scroll-to-top', 0.28, 0.78);

		for (let attempt = 0; attempt < 5; attempt += 1) {
			await this.swipeVertical(`collapse-${attempt}`, 0.12, 0.45, 50, 250);
			if (!(await this.isQueueListVisible())) return;
		}

		throw new Error('Timed out collapsing expanded now playing surface');
	}

	async swipeAwayIfVisible(): Promise<void> {
		await this.collapseExpandedIfVisible();
		if (!(await this.isVisible())) return;

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
	private async swipeUpSurface(id: string): Promise<void> {
		await this.swipeVertical(id, 0.78, 0.28);
	}

	private async scrollToQueueList(maxSwipes = 6): Promise<void> {
		if (await this.isQueueListVisible()) return;
		for (let attempt = 0; attempt < maxSwipes; attempt += 1) {
			await this.swipeUpSurface(`queue-scroll-${attempt}`);
			if (await this.isQueueListVisible()) return;
		}
	}

	private async swipeVertical(
		id: string,
		fromRatio: number,
		toRatio: number,
		pauseMs = 40,
		durationMs = 260,
	): Promise<void> {
		const rect = await this.driver.getWindowRect();
		const x = Math.floor(rect.width * 0.5);
		await this.driver.performActions([
			{
				actions: [
					{ duration: 0, type: 'pointerMove', x, y: Math.floor(rect.height * fromRatio) },
					{ button: 0, type: 'pointerDown' },
					{ duration: pauseMs, type: 'pause' },
					{ duration: durationMs, type: 'pointerMove', x, y: Math.floor(rect.height * toRatio) },
					{ button: 0, type: 'pointerUp' },
				],
				id,
				parameters: { pointerType: 'touch' },
				type: 'pointer',
			},
		]);
		await this.driver.releaseActions();
	}
}
