import { BasePage } from './Base';

export class NowPlayingBar extends BasePage {
	private readonly bar = 'now-playing-surface-bar';
	private readonly trackName = 'now-playing-track-name';
	private readonly artistLogoText = 'now-playing-artist-logo-text';
	private readonly progress = 'now-playing-progress';
	// the progress bar falls back to a plain bar (different id) when no waveform mask is available
	private readonly progressPlain = 'playback-progress-track';
	private readonly togglePlayback = 'now-playing-play-pause';
	private readonly next = 'now-playing-next';
	private readonly previous = 'now-playing-previous';
	private readonly queueTabUpNext = 'now-playing-tab-up-next';
	private readonly queueTabBackTo = 'now-playing-tab-back-to';
	private readonly createPlaylistFromQueue = 'now-playing-create-playlist-from-queue';
	private readonly queuePageUpNext = 'now-playing-queue-page-up-next';
	private readonly queuePageBackTo = 'now-playing-queue-page-back-to';
	private readonly footerHome = 'footer-home';

	private readonly trackTitleUpNextPrefix = 'track-title-up-next-';
	private readonly trackTitleBackToPrefix = 'track-title-back-to-';
	private readonly trackRowUpNextPrefix = 'track-row-up-next-';
	private readonly trackRowBackToPrefix = 'track-row-back-to-';
	private readonly trackRowSwipeRegionUpNextPrefix = 'track-row-swipe-region-up-next-';
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

	async getArtistName(): Promise<string> {
		const el = this.elementByID(this.artistLogoText);
		await el.waitForExist({ timeoutMsg: 'Timed out waiting for now playing artist name' });
		return (await el.getText()) ?? '';
	}

	// requires the expanded surface open; the progress bar usually scrolls off the top by now, so reveal it first
	async seekToNearEnd(): Promise<void> {
		const el = this.elementByID(await this.revealProgressBar());
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

	// the queue pages only mount once expanded and sit below the fold, so on iOS they aren't in the
	// accessibility tree until a scroll triggers layout. fall back to the expanded play/pause control,
	// which lives only on the expanded surface (not the compact bar) and reads as displayed only when
	// on screen — i.e. once the surface is expanded and settled, off-screen while collapsed
	async isExpanded(): Promise<boolean> {
		if (await this.isQueueListVisible()) return true;
		try {
			return await this.elementByID(this.togglePlayback).isDisplayed();
		} catch {
			return false;
		}
	}

	async openExpandedSurface(): Promise<void> {
		await this.elementByID(this.bar).waitForDisplayed({
			timeoutMsg: 'Timed out waiting for now playing bar',
		});

		// tapping the bar starts a ~0.4s expand animation; returning before it settles is the cold-start
		// flake, the queue tab is still parked off-screen so the tab tap lands on the footer nav instead.
		// re-resolve the bar each attempt: playback/palette/artwork settling at play-start recreates its
		// native view, and iOS throws stale-element on a cached handle where Android silently re-resolves
		for (let attempt = 0; attempt < 4; attempt += 1) {
			if (await this.isExpanded()) return;
			try {
				await this.elementByID(this.bar).click();
				await this.driver.waitUntil(async () => this.isExpanded(), {
					timeout: 4000,
					timeoutMsg: '',
				});
				return;
			} catch {
				// expand gesture dropped or the bar handle staled mid-tap (cold start under load), re-tap
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

	async swipeTracksIntoView(): Promise<void> {
		await this.swipeUpSurface('expand-for-up-next-tab');
	}

	async tapUpNextTab(): Promise<void> {
		this.activeTab = 'upNext';
		await this.selectQueueTab(
			'expand-for-up-next-tab',
			this.queueTabUpNext,
			this.queuePageUpNext,
			'up next',
		);
	}

	async tapBackToTab(): Promise<void> {
		this.activeTab = 'backTo';
		await this.selectQueueTab(
			'expand-for-back-to-tab',
			this.queueTabBackTo,
			this.queuePageBackTo,
			'back to',
		);
	}

	// re-resolve the tab each attempt: playback/palette/artwork settling at play-start recreates the
	// surface's native views, so a cached handle can stale between the scroll and the tap
	private async selectQueueTab(
		swipeHint: string,
		tabId: string,
		pageId: string,
		label: string,
	): Promise<void> {
		for (let attempt = 0; attempt < 3; attempt += 1) {
			try {
				await this.revealQueueTab(tabId, `${swipeHint}-${attempt}`);
				await this.elementByID(tabId).click();
				await this.elementByID(pageId).waitForExist({ timeout: 4000, timeoutMsg: '' });
				return;
			} catch {
				// tab staled mid-settle or the tap was dropped, scroll back to it and retry
			}
		}

		throw new Error(`Timed out waiting for ${label} tab`);
	}

	private async revealQueueTab(tabId: string, hint: string): Promise<void> {
		for (let step = 0; step < 6; step += 1) {
			if (await this.queueTabIsTappable(tabId)) return;
			await this.swipeVertical(`${hint}-forward-${step}`, 0.8, 0.52, 40, 500, 220);
		}

		for (let step = 0; step < 6; step += 1) {
			if (await this.queueTabIsTappable(tabId)) return;
			await this.swipeVertical(`${hint}-back-${step}`, 0.52, 0.8, 40, 500, 220);
		}

		throw new Error('Timed out scrolling the queue tabs row clear of the footer nav');
	}

	private async queueTabIsTappable(tabId: string): Promise<boolean> {
		const tab = this.elementByID(tabId);
		if (!(await tab.isDisplayed().catch(() => false))) return false;

		const location = await tab.getLocation();
		const size = await tab.getSize();
		return location.y >= 0 && location.y + size.height <= (await this.footerNavTop());
	}

	private async footerNavTop(): Promise<number> {
		const footerHome = this.elementByID(this.footerHome);
		if (await footerHome.isDisplayed().catch(() => false)) {
			return (await footerHome.getLocation()).y;
		}
		return (await this.driver.getWindowRect()).height;
	}

	// isExisting not isDisplayed: the page views sit in a translated sliding strip that UIAutomator2
	// reports as not displayed even when on screen; they only exist in the tree when the surface is open
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
		await this.scrollQueueToEnd();
		const text = await this.lastRenderedUpNextTitle();
		if (text) return text;
		throw new Error('No up next track titles found');
	}

	async upNextRowCount(): Promise<number> {
		await this.waitForQueueRowsVisible();
		return (await this.allByAccessibilityPrefix(this.trackRowSwipeRegionUpNextPrefix)).length;
	}

	async openTrackContextMenuOnUpNextRow(index: number): Promise<void> {
		await this.waitForQueueRowsVisible();
		const rows = await this.sortedByY(
			await this.allByAccessibilityPrefix(this.trackRowSwipeRegionUpNextPrefix),
		);
		if (index >= rows.length) {
			throw new Error(`No up next row at index ${index}`);
		}
		await this.longPressElement(rows[index]);
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

	async backToTrackNames(): Promise<Array<string>> {
		await this.waitForQueueRowsVisible();
		const labels = await this.sortedByY(
			await this.allByAccessibilityPrefix(this.trackTitleBackToPrefix),
		);
		const names: Array<string> = [];
		for (const label of labels) {
			names.push(await label.getText());
		}
		return names;
	}

	// the + button shares the queue tabs row, so the queue list must be on-screen first
	async tapCreatePlaylistFromQueue(): Promise<void> {
		await this.waitForQueueList();
		const el = this.elementByID(this.createPlaylistFromQueue);
		await el.waitForDisplayed({ timeoutMsg: 'Timed out waiting for create playlist button' });
		await el.click();
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
		if (!(await this.isExpanded())) return;

		// scroll back to top so the artwork drag zone is under the collapse swipe
		await this.swipeVertical('scroll-to-top', 0.28, 0.78);

		for (let attempt = 0; attempt < 5; attempt += 1) {
			await this.swipeVertical(`collapse-${attempt}`, 0.12, 0.45, 50, 250);
			if (!(await this.isExpanded())) return;
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

	// push the expanded surface above the footer nav bar so it doesn't intercept tab taps
	private async swipeUpSurface(id: string): Promise<void> {
		await this.swipeVertical(id, 0.78, 0.28);
	}

	private async scrollQueueToEnd(maxSwipes = 12): Promise<void> {
		let previous = '';
		for (let attempt = 0; attempt < maxSwipes; attempt += 1) {
			const current = await this.lastRenderedUpNextTitle();
			if (current !== '' && current === previous) return;
			previous = current;
			await this.swipeUpSurface(`queue-to-end-${attempt}`);
		}
	}

	private async lastRenderedUpNextTitle(): Promise<string> {
		const labels = await this.sortedByY(
			await this.allByAccessibilityPrefix(this.trackTitleUpNextPrefix),
		);
		for (let i = labels.length - 1; i >= 0; i -= 1) {
			const text = await labels[i].getText();
			if (text) return text;
		}
		return '';
	}

	private async scrollToQueueList(maxSwipes = 6): Promise<void> {
		if (await this.isQueueListVisible()) return;
		for (let attempt = 0; attempt < maxSwipes; attempt += 1) {
			await this.swipeUpSurface(`queue-scroll-${attempt}`);
			if (await this.isQueueListVisible()) return;
		}
	}

	// returns the id of whichever progress variant rendered; drags start in the lower half so they pan
	// the scroll content, starting higher hits the artwork collapse-drag zone and tears the surface down
	private async revealProgressBar(maxSwipes = 3): Promise<string> {
		for (let attempt = 0; attempt <= maxSwipes; attempt += 1) {
			for (const id of [this.progress, this.progressPlain]) {
				const visible = await this.elementByID(id)
					.isDisplayed()
					.catch(() => false);
				if (visible) return id;
			}
			if (attempt < maxSwipes) await this.swipeVertical(`reveal-progress-${attempt}`, 0.6, 0.88);
		}
		throw new Error('Timed out waiting for progress bar');
	}

	private async swipeVertical(
		id: string,
		fromRatio: number,
		toRatio: number,
		pauseMs = 40,
		durationMs = 260,
		holdMs = 0,
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
					...(holdMs > 0 ? [{ duration: holdMs, type: 'pause' as const }] : []),
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
