/** biome-ignore-all assist/source/useSortedKeys: **/
import { CardContextMenu } from '../pages/CardContextMenuModal';
import { FooterPage } from '../pages/Footer';
import { HomePage } from '../pages/HomePage';
import { LibraryPage } from '../pages/LibraryPage';
import { SearchPage } from '../pages/SearchPage';
import type { Scenario } from '../utils/table';

const scenarios: Array<Scenario> = [
	{
		label: 'library albums grid',
		arrange: async () => {
			const footer = new FooterPage(browser);
			await footer.tapLibrary();
			const library = new LibraryPage(browser);
			await library.waitForLoad();
			await library.openAlbumsTab();
			await library.tabs.albums.waitForLoad();
		},
		act: async () => {
			const library = new LibraryPage(browser);
			await library.tabs.albums.longPressFirstVisibleCard();
		},
	},
	{
		label: 'library artists grid',
		arrange: async () => {
			const footer = new FooterPage(browser);
			await footer.tapLibrary();
			const library = new LibraryPage(browser);
			await library.waitForLoad();
			await library.openArtistsTab();
			await library.tabs.artists.waitForLoad();
		},
		act: async () => {
			const library = new LibraryPage(browser);
			await library.tabs.artists.longPressFirstVisibleCard();
		},
	},
	{
		label: 'library playlists grid',
		arrange: async () => {
			const footer = new FooterPage(browser);
			await footer.tapLibrary();
			const library = new LibraryPage(browser);
			await library.waitForLoad();
			await library.openPlaylistsTab();
			await library.tabs.playlists.waitForLoad();
		},
		act: async () => {
			const library = new LibraryPage(browser);
			await library.tabs.playlists.longPressFirstVisibleCard();
		},
	},
	{
		label: 'search results',
		arrange: async () => {
			const footer = new FooterPage(browser);
			await footer.tapSearch();
			const searchPage = new SearchPage(browser);
			await searchPage.waitForLoad();
			await searchPage.enterSearchQuery('a');
			await searchPage.waitForCardResults();
		},
		act: async () => {
			const searchPage = new SearchPage(browser);
			await searchPage.longPressFirstVisibleCard();
		},
	},
	{
		label: 'home',
		arrange: async () => {
			const footer = new FooterPage(browser);
			await footer.tapHome();
			const homePage = new HomePage(browser);
			await homePage.waitForLoad();
			await homePage.waitForAlbumCards();
		},
		act: async () => {
			const homePage = new HomePage(browser);
			await homePage.longPressFirstVisibleAlbumCard();
		},
	},
	{
		label: 'library genres grid',
		arrange: async () => {
			const footer = new FooterPage(browser);
			await footer.tapLibrary();
			const library = new LibraryPage(browser);
			await library.waitForLoad();
			await library.openGenresTab();
			await library.tabs.genres.waitForLoad();
		},
		act: async () => {
			const library = new LibraryPage(browser);
			await library.tabs.genres.longPressFirstVisibleCard();
		},
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

		// FIXME: actually implement
		it('navigates to the correct place when tapping the header', async () => {
			await testCase.act();
			const menu = new CardContextMenu(browser);
			await menu.waitForHidden();
		});
	});
}
