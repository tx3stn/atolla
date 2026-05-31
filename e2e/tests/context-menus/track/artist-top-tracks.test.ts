import { ArtistDetailPage } from '../../../pages/ArtistDetailPage';
import { LibraryPage } from '../../../pages/LibraryPage';
import { defineTrackContextMenuSuite } from './shared';

defineTrackContextMenuSuite({
	act: async () => {
		const artistDetail = new ArtistDetailPage(browser);
		await artistDetail.openTrackContextMenuOnFirstVisibleRow();
	},
	arrange: async () => {
		const library = new LibraryPage(browser);
		await library.openArtistsTab();
		await library.tabs.artists.waitForLoad();
		await library.tabs.artists.tapFirstVisibleCard();

		const artistDetail = new ArtistDetailPage(browser);
		await artistDetail.waitForTrackRowsVisible();
		await artistDetail.DetailHeader().tapPlayButton();
	},
	label: 'artist top tracks',
});
