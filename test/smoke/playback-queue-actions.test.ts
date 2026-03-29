import { Toast } from 'test/pages/Toast';
import { AlbumDetailPage } from '../pages/AlbumDetailPage';
import { FooterPage } from '../pages/Footer';
import { HomePage } from '../pages/HomePage';
import { NowPlayingFooterPage } from '../pages/NowPlayingBar';

describe('now playing queue', () => {
	let nowPlaying: NowPlayingFooterPage;
	let initialUpNextFirstRow: string;
	let afterNextUpNextFirstRow: string;

	before(async () => {
		const footer = new FooterPage(browser);
		const home = new HomePage(browser);
		const albumDetail = new AlbumDetailPage(browser);
		nowPlaying = new NowPlayingFooterPage(browser);

		await footer.tapHome();
		await home.waitForLoad();
		await home.openAlbumsTab();
		await home.tabs.albums.waitForLoad();
		await home.tabs.albums.tapCardByID('album-1');

		await albumDetail.waitForLoad();
		await albumDetail.waitForTrackRowsVisible();
		await albumDetail.tapPlayButton();
		await nowPlaying.waitForVisible();
		await nowPlaying.openExpandedSurface();
		await nowPlaying.waitForQueueList();
		await nowPlaying.waitForQueueRowsVisible();
	});

	it('shows queue list when now playing is expanded', async () => {
		await nowPlaying.waitForQueueList();
		await nowPlaying.waitForQueueRowsVisible();
	});

	it('captures the initial first row in up next', async () => {
		await nowPlaying.tapUpNextTab();
		await nowPlaying.waitForQueueRowsVisible();
		initialUpNextFirstRow = await nowPlaying.firstVisibleQueueTrackRowId();
	});

	it('moves to next track and updates up next queue', async () => {
		await nowPlaying.tapNext();
		await nowPlaying.waitForQueueRowsVisible();
		afterNextUpNextFirstRow = await nowPlaying.firstVisibleQueueTrackRowId();
		expect(afterNextUpNextFirstRow).not.toBe(initialUpNextFirstRow);
	});

	it('shows previously active track in back to after next', async () => {
		await nowPlaying.tapBackToTab();
		await nowPlaying.waitForQueueRowsVisible();
		const backToFirstRow = await nowPlaying.firstVisibleQueueTrackRowId();
		expect(backToFirstRow).toBe(initialUpNextFirstRow);
	});

	it('restores prior up next head after tapping previous', async () => {
		await nowPlaying.tapPrevious();
		await nowPlaying.tapUpNextTab();
		await nowPlaying.waitForQueueRowsVisible();
		const afterPreviousUpNextFirstRow = await nowPlaying.firstVisibleQueueTrackRowId();
		expect(afterPreviousUpNextFirstRow).toBe(initialUpNextFirstRow);
		expect(afterPreviousUpNextFirstRow).not.toBe(afterNextUpNextFirstRow);
	});
});

describe('add to queue', () => {
	before(async () => {
		const footer = new FooterPage(browser);
		await footer.tapHome();

		const home = new HomePage(browser);
		await home.waitForLoad();
		await home.openAlbumsTab();
		await home.tabs.albums.waitForLoad();
		await home.tabs.albums.tapCardByID('album-1');

		const albumDetail = new AlbumDetailPage(browser);
		await albumDetail.waitForLoad();
	});

	it('opens track context menu from an album track row', async () => {
		const albumDetail = new AlbumDetailPage(browser);

		await albumDetail.waitForTrackRowsVisible();
		await albumDetail.openTrackContextMenuOnFirstVisibleRow();
		await albumDetail.waitForTrackContextMenuVisible();
	});

	it('shows toast when adding a track to queue from track context menu', async () => {
		const albumDetail = new AlbumDetailPage(browser);

		await albumDetail.waitForTrackRowsVisible();
		await albumDetail.openTrackContextMenuOnFirstVisibleRow();
		await albumDetail.waitForTrackContextMenuVisible();
		await albumDetail.tapTrackAddToQueueAction();

		const toast = new Toast(browser);
		expect(await toast.isVisible()).toBe(true);
	});

	it('shows toast when sending a track to play next from track context menu', async () => {
		const albumDetail = new AlbumDetailPage(browser);
		await albumDetail.waitForLoad();
		await albumDetail.waitForTrackRowsVisible();
		await albumDetail.openTrackContextMenuOnFirstVisibleRow();
		await albumDetail.waitForTrackContextMenuVisible();
		await albumDetail.tapTrackPlayNextAction();

		const toast = new Toast(browser);
		expect(await toast.isVisible()).toBe(true);
	});
});
