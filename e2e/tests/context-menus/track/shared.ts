import { AlbumDetailPage } from '../../../pages/AlbumDetailPage';
import { ArtistDetailPage } from '../../../pages/ArtistDetailPage';
import { FooterPage } from '../../../pages/Footer';
import { LibraryPage } from '../../../pages/LibraryPage';
import { NowPlayingBar } from '../../../pages/NowPlayingBar';
import { TrackContextMenu } from '../../../pages/TrackContextModal';
import type { Scenario } from '../../../utils/table';

function shouldSkip(): boolean {
	if (process.env.CHECK_FULL === 'true') {
		return true;
	}

	const maxInstances = (browser.options as { maxInstances?: number }).maxInstances ?? 1;
	return maxInstances > 1;
}

export function defineTrackContextMenuSuite(scenario: Scenario): void {
	describe(`track context menu from ${scenario.label}`, () => {
		beforeEach(async () => {
			await recoverToLibrary();
			await scenario.arrange();
		});

		afterEach(async () => {
			const footer = new FooterPage(browser);
			await recoverToLibrary();
			await footer.tapHome();
		});

		it('opens the context menu on long press', async () => {
			await scenario.act();
			const menu = new TrackContextMenu(browser);
			await menu.waitForVisible();
			expect(await menu.isDisplayed()).toBe(true);

			await menu.tapBackdrop();
			await menu.waitForHidden();
			expect(await menu.isDisplayed()).toBe(false);
		});

		it('dismisses after adding to queue', async () => {
			await scenario.act();
			const menu = new TrackContextMenu(browser);
			await menu.waitForVisible();
			const trackTitle = await menu.getTrackTitle();
			await menu.tapAddToQueue();
			await menu.waitForHidden();
			const nowPlaying = new NowPlayingBar(browser);
			await nowPlaying.waitForVisible();
			await nowPlaying.openExpandedSurface();
			await nowPlaying.tapUpNextTab();
			await nowPlaying.waitForQueueRowsVisible();
			expect(await nowPlaying.lastUpNextTrackName()).toBe(trackTitle);
			await nowPlaying.collapseExpandedIfVisible();
		});

		it('dismisses after play next', async () => {
			await scenario.act();
			const menu = new TrackContextMenu(browser);
			await menu.waitForVisible();
			const trackTitle = await menu.getTrackTitle();
			await menu.tapPlayNext();
			await menu.waitForHidden();
			const nowPlaying = new NowPlayingBar(browser);
			await nowPlaying.waitForVisible();
			await nowPlaying.openExpandedSurface();
			await nowPlaying.tapUpNextTab();
			await nowPlaying.waitForQueueRowsVisible();
			expect(await nowPlaying.firstUpNextTrackName()).toBe(trackTitle);
			await nowPlaying.collapseExpandedIfVisible();
		});

		it('opens the artist when tapping on the artist header', async function () {
			if (shouldSkip()) {
				this.skip();
			}

			await scenario.act();

			const menu = new TrackContextMenu(browser);
			await menu.waitForVisible();
			await menu.tapArtist();
			await menu.waitForHidden();

			const artistDetail = new ArtistDetailPage(browser);
			await artistDetail.waitForLoad();
			await artistDetail.swipeBack();
		});

		it('opens the album when tapping on the album track row', async function () {
			if (shouldSkip()) {
				this.skip();
			}

			await scenario.act();

			const menu = new TrackContextMenu(browser);
			await menu.waitForVisible();
			await menu.tapAlbumRow();
			await menu.waitForHidden();

			const albumDetail = new AlbumDetailPage(browser);
			await albumDetail.waitForLoad();
		});
	});
}

async function recoverToLibrary(): Promise<void> {
	const nowPlaying = new NowPlayingBar(browser);
	const footer = new FooterPage(browser);
	const menu = new TrackContextMenu(browser);

	try {
		await nowPlaying.collapseExpandedIfVisible();
	} catch {
		// best-effort recovery
	}

	try {
		await nowPlaying.swipeAwayIfVisible();
	} catch {
		// best-effort recovery
	}

	try {
		await menu.dismissIfVisible();
	} catch {
		// best-effort recovery
	}

	if (!(await footer.isVisible())) {
		for (let attempt = 0; attempt < 3; attempt += 1) {
			try {
				await footer.swipeBack();
			} catch {
				// best-effort recovery
			}

			if (await footer.isVisible()) break;
		}
	}

	await footer.tapHome();
	await footer.tapLibrary();
	const library = new LibraryPage(browser);
	await library.waitForLoad();
}
