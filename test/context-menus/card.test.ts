import { CardContextMenuPage } from '../pages/CardContextMenuPage';
import { FooterPage } from '../pages/Footer';
import { HomePage } from '../pages/HomePage';
import { LibraryPage } from '../pages/LibraryPage';
import { SearchPage } from '../pages/SearchPage';

interface Scenario {
	label: string;
	navigate: () => Promise<void>;
	openMenu: () => Promise<void>;
}

const scenarios: Array<Scenario> = [
	{
		label: 'library albums grid',
		navigate: async () => {
			const footer = new FooterPage(browser);
			await footer.tapLibrary();
			const library = new LibraryPage(browser);
			await library.waitForLoad();
			await library.openAlbumsTab();
			await library.tabs.albums.waitForLoad();
		},
		openMenu: async () => {
			const library = new LibraryPage(browser);
			await library.tabs.albums.longPressFirstVisibleCard();
		},
	},
	{
		label: 'library artists grid',
		navigate: async () => {
			const footer = new FooterPage(browser);
			await footer.tapLibrary();
			const library = new LibraryPage(browser);
			await library.waitForLoad();
			await library.openArtistsTab();
			await library.tabs.artists.waitForLoad();
		},
		openMenu: async () => {
			const library = new LibraryPage(browser);
			await library.tabs.artists.longPressFirstVisibleCard();
		},
	},
	{
		label: 'library playlists grid',
		navigate: async () => {
			const footer = new FooterPage(browser);
			await footer.tapLibrary();
			const library = new LibraryPage(browser);
			await library.waitForLoad();
			await library.openPlaylistsTab();
			await library.tabs.playlists.waitForLoad();
		},
		openMenu: async () => {
			const library = new LibraryPage(browser);
			await library.tabs.playlists.longPressFirstVisibleCard();
		},
	},
	{
		label: 'search results',
		navigate: async () => {
			const footer = new FooterPage(browser);
			await footer.tapSearch();
			const searchPage = new SearchPage(browser);
			await searchPage.waitForLoad();
			await searchPage.enterSearchQuery('a');
			await searchPage.waitForCardResults();
		},
		openMenu: async () => {
			const searchPage = new SearchPage(browser);
			await searchPage.longPressFirstVisibleCard();
		},
	},
	{
		label: 'home',
		navigate: async () => {
			const footer = new FooterPage(browser);
			await footer.tapHome();
			const homePage = new HomePage(browser);
			await homePage.waitForLoad();
			await homePage.waitForAlbumCards();
		},
		openMenu: async () => {
			const homePage = new HomePage(browser);
			await homePage.longPressFirstVisibleAlbumCard();
		},
	},
];

for (const scenario of scenarios) {
	describe(`card context menu from ${scenario.label}`, () => {
		before(() => scenario.navigate());

		it('opens the context menu on long press', async () => {
			await scenario.openMenu();
			const menu = new CardContextMenuPage(browser);
			await menu.waitForVisible();
			await menu.tapBackdrop();
			await menu.waitForHidden();
		});

		it('dismisses when the backdrop is tapped', async () => {
			await scenario.openMenu();
			const menu = new CardContextMenuPage(browser);
			await menu.waitForVisible();
			await menu.tapBackdrop();
			await menu.waitForHidden();
		});

		it('dismisses after play', async () => {
			await scenario.openMenu();
			const menu = new CardContextMenuPage(browser);
			await menu.waitForVisible();
			await menu.tapPlay();
			await menu.waitForHidden();
		});

		it('dismisses after adding to queue', async () => {
			await scenario.openMenu();
			const menu = new CardContextMenuPage(browser);
			await menu.waitForVisible();
			await menu.tapAddToQueue();
			await menu.waitForHidden();
		});

		it('dismisses after play next', async () => {
			await scenario.openMenu();
			const menu = new CardContextMenuPage(browser);
			await menu.waitForVisible();
			await menu.tapPlayNext();
			await menu.waitForHidden();
		});
	});
}
