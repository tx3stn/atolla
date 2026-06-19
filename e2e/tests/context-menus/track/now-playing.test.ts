import { AlbumDetailPage } from '../../../pages/AlbumDetailPage';
import { ArtistDetailPage } from '../../../pages/ArtistDetailPage';
import { FooterPage } from '../../../pages/Footer';
import { HomePage } from '../../../pages/HomePage';
import { NowPlayingBar } from '../../../pages/NowPlayingBar';
import { TrackContextMenu } from '../../../pages/TrackContextModal';

describe('track context menu from now playing surface', () => {
	let playingArtist = '';

	beforeEach(async () => {
		const footer = new FooterPage(browser);
		const home = new HomePage(browser);
		await footer.tapHome();
		await home.waitForLoad();
		await home.tapShuffleLibraryMix();

		const nowPlaying = new NowPlayingBar(browser);
		await nowPlaying.waitForVisible();
		await nowPlaying.openExpandedSurface();
		playingArtist = await nowPlaying.getArtistName();
		await nowPlaying.swipeTracksIntoView();
		await nowPlaying.waitForQueueRowsVisible();
	});

	afterEach(async () => {
		const menu = new TrackContextMenu(browser);
		const nowPlaying = new NowPlayingBar(browser);
		const footer = new FooterPage(browser);

		try {
			await menu.dismissIfVisible();
		} catch {
			// best-effort recovery
		}
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

		for (let attempt = 0; attempt < 3 && !(await footer.isVisible()); attempt += 1) {
			try {
				await footer.swipeBack();
			} catch {
				// best-effort recovery
			}
		}

		await footer.tapHome();
	});

	it('opens the selected track artist', async function () {
		if (shouldSkip()) {
			this.skip();
		}

		const { artist } = await openModalOnDifferentArtistRow(playingArtist);
		expect(artist).not.toBe(playingArtist);

		const menu = new TrackContextMenu(browser);
		await menu.tapArtist();
		await menu.waitForHidden();

		const artistDetail = new ArtistDetailPage(browser);
		await artistDetail.waitForLoad();
		expect(await artistDetail.artistName()).toBe(artist);
		await artistDetail.swipeBack();
	});

	it('opens the selected track album', async function () {
		if (shouldSkip()) {
			this.skip();
		}

		const { trackTitle } = await openModalOnDifferentArtistRow(playingArtist);

		const menu = new TrackContextMenu(browser);
		await menu.tapAlbumRow();
		await menu.waitForHidden();

		const albumDetail = new AlbumDetailPage(browser);
		await albumDetail.waitForLoad();
		expect(await albumDetail.trackTitles()).toContain(trackTitle);
		await albumDetail.swipeBack();
	});
});

function shouldSkip(): boolean {
	if (process.env.CHECK_FULL === 'true') {
		return true;
	}

	const maxInstances = (browser.options as { maxInstances?: number }).maxInstances ?? 1;
	return maxInstances > 1;
}

// Opens the now playing context menu on the first up-next track whose artist differs from
// the currently playing track — the exact condition the bug regressed on (the modal used the
// playing track's artist/album instead of the selected one). Returns the selected track's
// artist and title so the caller can assert where the modal links navigate.
async function openModalOnDifferentArtistRow(
	playingArtist: string,
): Promise<{ artist: string; trackTitle: string }> {
	const nowPlaying = new NowPlayingBar(browser);
	const menu = new TrackContextMenu(browser);

	for (let index = 15; index < 30; index += 1) {
		await nowPlaying.openTrackContextMenuOnUpNextRow(index);
		await menu.waitForVisible();

		const artist = await menu.getArtistName();
		if (artist && artist !== playingArtist) {
			return { artist, trackTitle: await menu.getTrackTitle() };
		}

		await menu.tapBackdrop();
		await menu.waitForHidden();
	}

	throw new Error('No up next track with a different artist than the playing track');
}
