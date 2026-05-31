import { GenreDetailPage } from '../../../pages/GenreDetailPage';
import { LibraryPage } from '../../../pages/LibraryPage';
import { defineTrackContextMenuSuite } from './shared';

defineTrackContextMenuSuite({
	act: async () => {
		const genreDetail = new GenreDetailPage(browser);
		await genreDetail.openTrackContextMenuOnFirstVisibleRow();
	},
	arrange: async () => {
		const library = new LibraryPage(browser);
		await library.openGenresTab();
		await library.tabs.genres.waitForLoad();
		await library.tabs.genres.tapFirstVisibleCard();
		const genreDetail = new GenreDetailPage(browser);
		await genreDetail.waitForTrackRowsVisible();
		await genreDetail.DetailHeader().tapPlayButton();
	},
	label: 'genre detail',
});
