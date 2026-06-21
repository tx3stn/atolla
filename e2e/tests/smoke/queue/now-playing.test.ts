import { AlbumDetailPage } from '../../../pages/AlbumDetailPage';
import { FooterPage } from '../../../pages/Footer';
import { LibraryPage } from '../../../pages/LibraryPage';
import { NowPlayingBar } from '../../../pages/NowPlayingBar';

describe('now playing queue', () => {
	let nowPlaying: NowPlayingBar;
	let firstUpNextTrackName: string;
	let secondUpNextTrackName: string;
	let albumDetail: AlbumDetailPage;

	before(async () => {
		nowPlaying = new NowPlayingBar(browser);
		albumDetail = new AlbumDetailPage(browser);

		const footer = new FooterPage(browser);
		await footer.tapLibrary();

		const library = new LibraryPage(browser);
		await library.waitForLoad();
		await library.openAlbumsTab();
		await library.tabs.albums.waitForLoad();
		await library.tabs.albums.tapCardByID('album-24');

		await albumDetail.waitForLoad();
		await albumDetail.waitForTrackRowsVisible();
	});

	after(async () => {
		await nowPlaying?.collapseExpandedIfVisible();
		await nowPlaying?.swipeAwayIfVisible();
	});

	it('shows queue list when now playing is expanded', async () => {
		await albumDetail.DetailHeader().tapPlayButton();

		await nowPlaying.waitForVisible();
		await nowPlaying.openExpandedSurface();
		await nowPlaying.waitForQueueList();
		expect(await nowPlaying.isQueueListVisible()).toBe(true);
	});

	it('shows tracks in the up next queue', async () => {
		await nowPlaying.tapUpNextTab();
		firstUpNextTrackName = await nowPlaying.firstUpNextTrackName();
		expect(firstUpNextTrackName).toBeTruthy();
	});

	it('advances the queue when next is tapped', async () => {
		await nowPlaying.tapNext();
		secondUpNextTrackName = await nowPlaying.firstUpNextTrackName();
		expect(secondUpNextTrackName).not.toBe(firstUpNextTrackName);
	});

	it('moves the played track to back to on the next tap', async () => {
		await nowPlaying.tapNext();
		await nowPlaying.tapBackToTab();
		const backToTrackName = await nowPlaying.firstBackToTrackName();
		expect(backToTrackName).toBe(firstUpNextTrackName);
	});

	it('restarts the track on previous mid-playback and goes back on a quick second tap', async () => {
		// previous follows the 3-second rule: more than 3s into the track the first tap
		// restarts it (queue unchanged), and a quick follow-up tap steps back a track.
		// seek near the end to push progress past the threshold deterministically; a timed
		// pause races the native player's progress reconciliation, which lags under parallel
		// device load and leaves progress under 3s. the back-to tab is still open from the
		// previous test
		await nowPlaying.seekToNearEnd();
		await nowPlaying.tapPrevious();
		expect(await nowPlaying.firstBackToTrackName()).toBe(firstUpNextTrackName);

		await nowPlaying.tapPrevious();
		await nowPlaying.tapUpNextTab();
		const afterPreviousTrackName = await nowPlaying.firstUpNextTrackName();
		expect(afterPreviousTrackName).toBe(secondUpNextTrackName);
	});

	it('jumps to a previously played track when its back-to row is tapped', async () => {
		// tapping a back-to row must move playback back to that track, which then leaves the
		// back-to (history) list. the native backward-rebuild guard used to suppress the
		// configure and the reconcile poll snapped the store straight back, so the row tap
		// did nothing and the track stayed at the top of back-to
		await nowPlaying.tapUpNextTab();
		await nowPlaying.tapNext();

		await nowPlaying.tapBackToTab();
		const target = await nowPlaying.firstBackToTrackName();
		await nowPlaying.tapFirstBackToRow();

		// the regression moved the store then snapped it back on the next ~200ms reconcile,
		// so let it settle before re-reading the history
		await browser.pause(1500);
		expect(await nowPlaying.firstBackToTrackName()).not.toBe(target);
	});
});
