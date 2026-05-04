import { TrackContextMenu } from 'test/pages/TrackContextModal';
import { AlbumDetailPage } from '../../pages/AlbumDetailPage';
import { FooterPage } from '../../pages/Footer';
import { LibraryPage } from '../../pages/LibraryPage';

describe('add to queue', () => {
	before(async () => {
		const footer = new FooterPage(browser);
		await footer.tapLibrary();

		const home = new LibraryPage(browser);
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

		const menu = new TrackContextMenu(browser);
		await menu.waitForVisible();
	});

	it('dismisses track context menu when adding a track to queue', async () => {
		const menu = new TrackContextMenu(browser);
		await menu.waitForVisible();
		await menu.tapAddToQueue();
		await menu.waitForHidden();
	});

	it('dismisses track context menu when sending a track to play next', async () => {
		const albumDetail = new AlbumDetailPage(browser);
		await albumDetail.waitForLoad();
		await albumDetail.waitForTrackRowsVisible();
		await albumDetail.openTrackContextMenuOnFirstVisibleRow();

		const menu = new TrackContextMenu(browser);
		await menu.waitForVisible();
		await menu.tapPlayNext();
		await menu.waitForHidden();
	});
});
