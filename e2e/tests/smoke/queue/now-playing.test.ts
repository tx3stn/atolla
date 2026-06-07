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
		// Previous follows the standard 3-second rule: more than 3s into the track the
		// first tap restarts it (queue unchanged), and a quick follow-up tap steps back
		// a track. The back-to tab is still open from the previous test.
		await browser.pause(3500);
		await nowPlaying.tapPrevious();
		expect(await nowPlaying.firstBackToTrackName()).toBe(firstUpNextTrackName);

		await nowPlaying.tapPrevious();
		await nowPlaying.tapUpNextTab();
		const afterPreviousTrackName = await nowPlaying.firstUpNextTrackName();
		expect(afterPreviousTrackName).toBe(secondUpNextTrackName);
	});
});
