import { CardContextMenu } from '../../pages/CardContextMenuModal';
import { FooterPage } from '../../pages/Footer';
import { HomePage } from '../../pages/HomePage';
import { LibraryPage } from '../../pages/LibraryPage';
import { SearchPage } from '../../pages/SearchPage';
import type { Scenario } from '../../utils/table';

const scenarios: Array<Scenario> = [
	{
		act: async () => {
			const library = new LibraryPage(browser);
			await library.tabs.albums.longPressFirstVisibleCard();
		},
		arrange: async () => {
			const footer = new FooterPage(browser);
			await footer.tapLibrary();
			const library = new LibraryPage(browser);
			await library.waitForLoad();
			await library.openAlbumsTab();
			await library.tabs.albums.waitForLoad();
		},
		label: 'library albums grid',
	},
	{
		act: async () => {
			const library = new LibraryPage(browser);
			await library.tabs.artists.longPressFirstVisibleCard();
		},
		arrange: async () => {
			const footer = new FooterPage(browser);
			await footer.tapLibrary();
			const library = new LibraryPage(browser);
			await library.waitForLoad();
			await library.openArtistsTab();
			await library.tabs.artists.waitForLoad();
		},
		label: 'library artists grid',
	},
	{
		act: async () => {
			const library = new LibraryPage(browser);
			await library.tabs.playlists.longPressFirstVisibleCard();
		},
		arrange: async () => {
			const footer = new FooterPage(browser);
			await footer.tapLibrary();
			const library = new LibraryPage(browser);
			await library.waitForLoad();
			await library.openPlaylistsTab();
			await library.tabs.playlists.waitForLoad();
		},
		label: 'library playlists grid',
	},
	{
		act: async () => {
			const searchPage = new SearchPage(browser);
			await searchPage.longPressFirstVisibleCard();
		},
		arrange: async () => {
			const footer = new FooterPage(browser);
			await footer.tapSearch();
			const searchPage = new SearchPage(browser);
			await searchPage.waitForLoad();
			await searchPage.enterSearchQuery('a');
			await searchPage.waitForCardResults();
		},
		label: 'search results',
	},
	{
		act: async () => {
			const homePage = new HomePage(browser);
			await homePage.longPressFirstVisibleAlbumCard();
		},
		arrange: async () => {
			const footer = new FooterPage(browser);
			await footer.tapHome();
			const homePage = new HomePage(browser);
			await homePage.waitForLoad();
			await homePage.waitForAlbumCards();
		},
		label: 'home',
	},
	{
		act: async () => {
			const library = new LibraryPage(browser);
			await library.tabs.genres.longPressFirstVisibleCard();
		},
		arrange: async () => {
			const footer = new FooterPage(browser);
			await footer.tapLibrary();
			const library = new LibraryPage(browser);
			await library.waitForLoad();
			await library.openGenresTab();
			await library.tabs.genres.waitForLoad();
		},
		label: 'library genres grid',
	},
];

for (const testCase of scenarios) {
	describe(`card context menu from ${testCase.label}`, () => {
		before(() => testCase.arrange());

		it('opens the context menu on long press', async () => {
			await testCase.act();
			const menu = new CardContextMenu(browser);
			await menu.waitForVisible();
			await menu.tapBackdrop();
			await menu.waitForHidden();
		});

		it('dismisses when the backdrop is tapped', async () => {
			await testCase.act();
			const menu = new CardContextMenu(browser);
			await menu.waitForVisible();
			await menu.tapBackdrop();
			await menu.waitForHidden();
		});

		it('dismisses after play', async () => {
			await testCase.act();
			const menu = new CardContextMenu(browser);
			await menu.waitForVisible();
			await menu.tapPlay();
			await menu.waitForHidden();
		});

		it('dismisses after adding to queue', async () => {
			await testCase.act();
			const menu = new CardContextMenu(browser);
			await menu.waitForVisible();
			await menu.tapAddToQueue();
			await menu.waitForHidden();
			// FIXME: assert item is actually added to queue
		});

		it('dismisses after play next', async () => {
			await testCase.act();
			const menu = new CardContextMenu(browser);
			await menu.waitForVisible();
			await menu.tapPlayNext();
			await menu.waitForHidden();
			// FIXME: assert item is actually added to play next
		});

		// it('navigates to the correct place when tapping the header', async () => {
		// 	await testCase.act();
		// 	let menu = new CardContextMenu(browser);
		// 	await menu.waitForVisible();
		// 	await menu.tapAlbumRow();
		// 	await menu.waitForHidden();
		//
		// 	const albumDetail = new AlbumDetailPage(browser);
		// 	await albumDetail.waitForLoad();
		//
		// 	await testCase.arrange();
		// 	await testCase.act();
		// 	menu = new CardContextMenu(browser);
		// 	await menu.waitForVisible();
		// 	await menu.tapArtist();
		// 	await menu.waitForHidden();
		//
		// 	const artistDetail = new ArtistDetailPage(browser);
		// 	await artistDetail.waitForLoad();
		// });
	});
}
