import { Toast } from 'test/pages/Toast';
import { AlbumDetailPage } from '../../pages/AlbumDetailPage';
import { FooterPage } from '../../pages/Footer';
import { HomePage } from '../../pages/HomePage';
import { TrackContextMenu } from 'test/pages/TrackContextModal';

describe('add to queue', () => {
	before(async () => {
		const footer = new FooterPage(browser);
		await footer.tapHome();

		const home = new HomePage(browser);
		await home.waitForLoad();
		await home.openAlbumsTab();
		await home.tabs.albums.waitForLoad();
		await home.tabs.albums.tapCardByID('album-27');

		const albumDetail = new AlbumDetailPage(browser);
		await albumDetail.waitForLoad();
	});

	it('opens track context menu from an album track row', async () => {
		const albumDetail = new AlbumDetailPage(browser);

		await albumDetail.waitForTrackRowsVisible();
		await albumDetail.openTrackContextMenuOnFirstVisibleRow();

		const menu = new TrackContextMenu(driver);
		await menu.waitForVisible();
	});

	it('shows toast when adding a track to queue from track context menu', async () => {
		const menu = new TrackContextMenu(driver);
		await menu.waitForVisible();
		await menu.tapAddToQueue();

		const toast = new Toast(browser);
		expect(await toast.isVisible()).toBe(true);
	});

	it('shows toast when sending a track to play next from track context menu', async () => {
		const albumDetail = new AlbumDetailPage(browser);
		await albumDetail.waitForLoad();
		await albumDetail.waitForTrackRowsVisible();
		await albumDetail.openTrackContextMenuOnFirstVisibleRow();

		const menu = new TrackContextMenu(driver);
		await menu.waitForVisible();
		await menu.tapPlayNext();

		const toast = new Toast(browser);
		expect(await toast.isVisible()).toBe(true);
	});
});
