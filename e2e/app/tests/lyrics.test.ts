import { AlbumDetailPage } from '../pages/AlbumDetailPage';
import { FooterPage } from '../pages/Footer';
import { HomePage } from '../pages/HomePage';
import { LyricsModal } from '../pages/LyricsModal';
import { NowPlayingBar } from '../pages/NowPlayingBar';
import { TrackContextMenu } from '../pages/TrackContextModal';

// the mock server gives album-1 (Jane Doe) the only tracks with lyrics: track 1 is synced with 34
// timestamped lines across its runtime, which is what the highlighting test reads back. it is a
// 2001 release so it sits in the home tab's "on this day" anniversary list, at the very top of the
// tab — both tests open it from there rather than paging through the library and scrolling a grid
const LYRICS_ALBUM_ID = 'album-1';

// "synced line 7 at 16s" — the fixture text carries its own timestamp so a highlighted line can be
// checked against the position it belongs to
const SYNCED_LINE = /^synced line (\d+) at (\d+)s/;

function parseSyncedLine(text: string): { lineNumber: number; seconds: number } {
	const match = SYNCED_LINE.exec(text);
	if (!match) {
		throw new Error(`Highlighted line is not a synced fixture line: "${text}"`);
	}
	return { lineNumber: Number(match[1]), seconds: Number(match[2]) };
}

async function openLyricsAlbum(): Promise<void> {
	const home = new HomePage(browser);
	await home.waitForLoad();
	await home.tapOnThisDayAlbumByID(LYRICS_ALBUM_ID);

	const albumDetail = new AlbumDetailPage(browser);
	await albumDetail.waitForTrackRowsVisible();
}

async function recoverToHome(): Promise<void> {
	const nowPlaying = new NowPlayingBar(browser);
	const footer = new FooterPage(browser);

	for (const recover of [
		() => new LyricsModal(browser).dismissIfVisible(),
		() => new TrackContextMenu(browser).dismissIfVisible(),
		() => nowPlaying.collapseExpandedIfVisible(),
		() => nowPlaying.swipeAwayIfVisible(),
	]) {
		try {
			await recover();
		} catch {
			// best-effort recovery
		}
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
	await new HomePage(browser).waitForLoad();
}

describe('lyrics', () => {
	beforeEach(async () => {
		await recoverToHome();
	});

	afterEach(async () => {
		await recoverToHome();
	});

	it('shows the lyrics for a track from its context menu', async () => {
		await openLyricsAlbum();

		const albumDetail = new AlbumDetailPage(browser);
		await albumDetail.openTrackContextMenuOnFirstVisibleRow();

		const menu = new TrackContextMenu(browser);
		await menu.waitForVisible();
		await menu.tapLyrics();

		const lyrics = new LyricsModal(browser);
		await lyrics.waitForVisible();
		await lyrics.waitForLines();

		expect(await lyrics.showsEmptyState()).toBe(false);

		const lines = await lyrics.visibleLineTexts();
		expect(lines.length).toBeGreaterThan(0);
		for (const line of lines) {
			expect(line.length).toBeGreaterThan(0);
		}

		await lyrics.dismiss();
	});

	it('highlights the lyric line the playing track has reached', async () => {
		await openLyricsAlbum();

		const albumDetail = new AlbumDetailPage(browser);
		await albumDetail.DetailHeader().tapPlayButton();

		const nowPlaying = new NowPlayingBar(browser);
		await nowPlaying.waitForVisible();
		await nowPlaying.openExpandedSurface();
		await nowPlaying.swipeToLyricsPage();

		const firstText = await nowPlaying.waitForActiveLyricLine();
		const first = parseSyncedLine(firstText);
		const second = parseSyncedLine(await nowPlaying.waitForActiveLyricLine(firstText));

		// the highlight tracks playback forwards through the fixture's timestamps; blank verse-break
		// lines carry no highlight, so the next highlighted line is not always the next index
		expect(second.lineNumber).toBeGreaterThan(first.lineNumber);
		expect(second.seconds).toBeGreaterThan(first.seconds);

		await nowPlaying.collapseExpandedIfVisible();
	});
});
