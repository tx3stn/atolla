import { AlbumDetailPage } from '../pages/AlbumDetailPage';
import { ArtistDetailPage } from '../pages/ArtistDetailPage';
import { FooterPage } from '../pages/Footer';
import { GenreDetailPage } from '../pages/GenreDetailPage';
import { LibraryPage } from '../pages/LibraryPage';
import { PlaylistDetailPage } from '../pages/PlaylistDetailPage';
import { SearchPage } from '../pages/SearchPage';
import { TrackContextMenu } from '../pages/TrackContextModal';

interface Scenario {
	label: string;
	navigate: () => Promise<void>;
	openMenu: () => Promise<void>;
}

const scenarios: Array<Scenario> = [
	{
		label: 'album detail',
		navigate: async () => {
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
		openMenu: async () => {
			const albumDetail = new AlbumDetailPage(browser);
			await albumDetail.openTrackContextMenuOnFirstVisibleRow();
		},
	},
	{
		label: 'playlist detail',
		navigate: async () => {
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
		openMenu: async () => {
			const playlistDetail = new PlaylistDetailPage(browser);
			await playlistDetail.openTrackContextMenuOnFirstVisibleRow();
		},
	},
	{
		label: 'artist detail',
		navigate: async () => {
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
		openMenu: async () => {
			const artistDetail = new ArtistDetailPage(browser);
			await artistDetail.openTrackContextMenuOnFirstVisibleRow();
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
			await searchPage.waitForTrackResults();
		},
		openMenu: async () => {
			const searchPage = new SearchPage(browser);
			await searchPage.openTrackContextMenuOnFirstVisibleTrackRow();
		},
	},
	{
		label: 'genre detail',
		navigate: async () => {
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
		openMenu: async () => {
			const genreDetail = new GenreDetailPage(browser);
			await genreDetail.openTrackContextMenuOnFirstVisibleRow();
		},
	},
];

for (const scenario of scenarios) {
	describe(`track context menu from ${scenario.label}`, () => {
		before(() => scenario.navigate());

		it('opens the context menu on long press', async () => {
			await scenario.openMenu();
			const menu = new TrackContextMenu(browser);
			await menu.waitForVisible();
			await menu.tapBackdrop();
			await menu.waitForHidden();
		});

		it('dismisses when the backdrop is tapped', async () => {
			await scenario.openMenu();
			const menu = new TrackContextMenu(browser);
			await menu.waitForVisible();
			await menu.tapBackdrop();
			await menu.waitForHidden();
		});

		it('dismisses after adding to queue', async () => {
			await scenario.openMenu();
			const menu = new TrackContextMenu(browser);
			await menu.waitForVisible();
			await menu.tapAddToQueue();
			await menu.waitForHidden();
		});

		it('dismisses after play next', async () => {
			await scenario.openMenu();
			const menu = new TrackContextMenu(browser);
			await menu.waitForVisible();
			await menu.tapPlayNext();
			await menu.waitForHidden();
		});
	});
}
