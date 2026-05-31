import { AlbumDetailPage } from '../../../pages/AlbumDetailPage';
import { LibraryPage } from '../../../pages/LibraryPage';
import { defineTrackContextMenuSuite } from './shared';

defineTrackContextMenuSuite({
	act: async () => {
		const albumDetail = new AlbumDetailPage(browser);
		await albumDetail.openTrackContextMenuOnFirstVisibleRow();
	},
	arrange: async () => {
		const library = new LibraryPage(browser);
		await library.openAlbumsTab();
		await library.tabs.albums.waitForLoad();
		await library.tabs.albums.tapFirstVisibleCard();

		const albumDetail = new AlbumDetailPage(browser);
		await albumDetail.waitForTrackRowsVisible();
		await albumDetail.DetailHeader().tapPlayButton();
	},
	label: 'album detail',
});
