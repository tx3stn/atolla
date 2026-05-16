/** biome-ignore-all assist/source/useSortedKeys: **/
import { AlbumDetailPage } from '../pages/AlbumDetailPage';
import { ArtistDetailPage } from '../pages/ArtistDetailPage';
import { FooterPage } from '../pages/Footer';
import { GenreDetailPage } from '../pages/GenreDetailPage';
import { LibraryPage } from '../pages/LibraryPage';
import { PlaylistDetailPage } from '../pages/PlaylistDetailPage';
import { SearchPage } from '../pages/SearchPage';
import { TrackContextMenu } from '../pages/TrackContextModal';
import type { Scenario } from '../utils/table';

const scenarios: Array<Scenario> = [
	{
		label: 'album detail',
		arrange: async () => {
			const footer = new FooterPage(browser);
			await footer.tapLibrary();
			const library = new LibraryPage(browser);
			await library.waitForLoad();
			await library.openAlbumsTab();
			await library.tabs.albums.waitForLoad();
			await library.tabs.albums.tapFirstVisibleCard();
			const albumDetail = new AlbumDetailPage(browser);
			await albumDetail.waitForTrackRowsVisible();
		},
		act: async () => {
			const albumDetail = new AlbumDetailPage(browser);
			await albumDetail.openTrackContextMenuOnFirstVisibleRow();
		},
	},
	{
		label: 'playlist detail',
		arrange: async () => {
			const footer = new FooterPage(browser);
			await footer.tapLibrary();
			const library = new LibraryPage(browser);
			await library.waitForLoad();
			await library.openPlaylistsTab();
			await library.tabs.playlists.waitForLoad();
			await library.tabs.playlists.tapFirstVisibleCard();
			const playlistDetail = new PlaylistDetailPage(browser);
			await playlistDetail.waitForTrackRowsVisible();
		},
		act: async () => {
			const playlistDetail = new PlaylistDetailPage(browser);
			await playlistDetail.openTrackContextMenuOnFirstVisibleRow();
		},
	},
	{
		label: 'artist detail',
		arrange: async () => {
			const footer = new FooterPage(browser);
			await footer.tapLibrary();
			const library = new LibraryPage(browser);
			await library.waitForLoad();
			await library.openArtistsTab();
			await library.tabs.artists.waitForLoad();
			await library.tabs.artists.tapFirstVisibleCard();
			const artistDetail = new ArtistDetailPage(browser);
			await artistDetail.waitForTrackRowsVisible();
		},
		act: async () => {
			const artistDetail = new ArtistDetailPage(browser);
			await artistDetail.openTrackContextMenuOnFirstVisibleRow();
		},
	},
	{
		label: 'search results',
		arrange: async () => {
			const footer = new FooterPage(browser);
			await footer.tapSearch();
			const searchPage = new SearchPage(browser);
			await searchPage.waitForLoad();
			await searchPage.enterSearchQuery('bod');
			await searchPage.waitForTrackResults();
		},
		act: async () => {
			const searchPage = new SearchPage(browser);
			await searchPage.openTrackContextMenuOnFirstVisibleTrackRow();
		},
	},
	{
		label: 'genre detail',
		arrange: async () => {
			const footer = new FooterPage(browser);
			await footer.tapLibrary();
			const library = new LibraryPage(browser);
			await library.waitForLoad();
			await library.openGenresTab();
			await library.tabs.genres.waitForLoad();
			await library.tabs.genres.tapFirstVisibleCard();
			const genreDetail = new GenreDetailPage(browser);
			await genreDetail.waitForTrackRowsVisible();
		},
		act: async () => {
			const genreDetail = new GenreDetailPage(browser);
			await genreDetail.openTrackContextMenuOnFirstVisibleRow();
		},
	},
];

for (const testCase of scenarios) {
	describe(`track context menu from ${testCase.label}`, () => {
		before(() => testCase.arrange());

		it('opens the context menu on long press', async () => {
			await testCase.act();
			const menu = new TrackContextMenu(browser);
			await menu.waitForVisible();
			await menu.tapBackdrop();
			await menu.waitForHidden();
		});

		it('dismisses when the backdrop is tapped', async () => {
			await testCase.act();
			const menu = new TrackContextMenu(browser);
			await menu.waitForVisible();
			await menu.tapBackdrop();
			await menu.waitForHidden();
		});

		it('dismisses after adding to queue', async () => {
			await testCase.act();
			const menu = new TrackContextMenu(browser);
			await menu.waitForVisible();
			await menu.tapAddToQueue();
			await menu.waitForHidden();
			// TODO: assert item is actually added to queue
		});

		it('dismisses after play next', async () => {
			await testCase.act();
			const menu = new TrackContextMenu(browser);
			await menu.waitForVisible();
			await menu.tapPlayNext();
			await menu.waitForHidden();
			// TODO: assert item is actually added to play next
		});

		// it('opens the artist when tapping on the artist header', async () => {
		// 	await testCase.act();
		// 	const menu = new TrackContextMenu(browser);
		// 	await menu.waitForVisible();
		// 	// TODO: assert artist navigation
		// });
		//
		// it('opens the album when tapping on the album track row', async () => {
		// 	await testCase.act();
		// 	const menu = new TrackContextMenu(browser);
		// 	await menu.waitForHidden();
		// 	// TODO: assert artist navigation
		// });
	});
}
