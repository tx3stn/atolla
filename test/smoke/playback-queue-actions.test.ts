import { AlbumDetailPage } from '../pages/AlbumDetailPage';
import { FooterPage } from '../pages/Footer';
import { HomePage } from '../pages/HomePage';
import { NowPlayingFooterPage } from '../pages/NowPlayingBar';

describe('playback queue and track actions', () => {
	let albumDetail: AlbumDetailPage;
	let footer: FooterPage;
	let home: HomePage;
	let nowPlaying: NowPlayingFooterPage;

	beforeEach(async () => {
		albumDetail = new AlbumDetailPage(browser);
		footer = new FooterPage(browser);
		home = new HomePage(browser);
		nowPlaying = new NowPlayingFooterPage(browser);

		await footer.tapHome();
		await home.waitForLoad();
		await home.openAlbumsTab();
		await home.tabs.albums.tapFirstVisibleCard();
		await albumDetail.waitForLoad();
	});

	it('opens now playing and allows queue tab switching during playback', async () => {
		await albumDetail.tapPlayButton();
		await nowPlaying.waitForVisible();

		await nowPlaying.openExpandedSurface();
		await nowPlaying.waitForQueueList();

		await nowPlaying.tapBackToTab();
		await nowPlaying.waitForQueueList();

		await nowPlaying.tapUpNextTab();
		await nowPlaying.waitForQueueList();

		await nowPlaying.tapNext();
		await nowPlaying.tapPrevious();
		await nowPlaying.tapTogglePlayback();
		await nowPlaying.tapTogglePlayback();

		expect(await browser.$('~now-playing-play-pause').isDisplayed()).toBe(true);
	});

	it('shows toast when adding a track to queue from track context menu', async () => {
		await albumDetail.openTrackContextMenuOnFirstVisibleRow();
		await albumDetail.tapTrackAddToQueueAction();
		await albumDetail.waitForToastVisible();

		expect(await browser.$('~toast').isDisplayed()).toBe(true);
	});

	it('shows toast when sending a track to play next from track context menu', async () => {
		await albumDetail.openTrackContextMenuOnFirstVisibleRow();
		await albumDetail.tapTrackPlayNextAction();
		await albumDetail.waitForToastVisible();

		expect(await browser.$('~toast').isDisplayed()).toBe(true);
	});
});
