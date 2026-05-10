import { AlbumDetailPage } from '../../pages/AlbumDetailPage';
import { FooterPage } from '../../pages/Footer';
import { LibraryPage } from '../../pages/LibraryPage';
import { NowPlayingFooterPage } from '../../pages/NowPlayingBar';

describe('now playing queue', () => {
	let nowPlaying: NowPlayingFooterPage;
	let firstUpNextTrackName: string;
	let secondUpNextTrackName: string;
	let albumDetail: AlbumDetailPage;

	before(async () => {
		nowPlaying = new NowPlayingFooterPage(browser);
		albumDetail = new AlbumDetailPage(browser);

		const footer = new FooterPage(browser);
		await footer.tapLibrary();

		const home = new LibraryPage(browser);
		await home.waitForLoad();
		await home.openAlbumsTab();
		await home.tabs.albums.waitForLoad();
		await home.tabs.albums.tapCardByID('album-24');

		await albumDetail.waitForLoad();
		await albumDetail.waitForTrackRowsVisible();
	});

	after(async () => {
		await nowPlaying?.collapseExpandedIfVisible();
		await nowPlaying?.swipeAwayIfVisible();
	});

	it('shows queue list when now playing is expanded', async () => {
		await albumDetail.tapPlayButton();

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

	it('restores up next after tapping previous', async () => {
		await nowPlaying.tapPrevious();
		await nowPlaying.tapUpNextTab();
		const afterPreviousTrackName = await nowPlaying.firstUpNextTrackName();
		expect(afterPreviousTrackName).toBe(secondUpNextTrackName);
	});
});
