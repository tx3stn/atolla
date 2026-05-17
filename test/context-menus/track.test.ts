/** biome-ignore-all assist/source/useSortedKeys: **/
import { AlbumDetailPage } from '../pages/AlbumDetailPage';
import { ArtistDetailPage } from '../pages/ArtistDetailPage';
import { FooterPage } from '../pages/Footer';
import { GenreDetailPage } from '../pages/GenreDetailPage';
import { LibraryPage } from '../pages/LibraryPage';
import { NowPlayingBar } from '../pages/NowPlayingBar';
import { PlaylistDetailPage } from '../pages/PlaylistDetailPage';
import { TrackContextMenu } from '../pages/TrackContextModal';
import type { Scenario } from '../utils/table';

const scenarios: Array<Scenario> = [
	{
		label: 'album detail',
		arrange: async () => {
			const library = new LibraryPage(browser);
			await library.openAlbumsTab();
			await library.tabs.albums.waitForLoad();
			await library.tabs.albums.tapFirstVisibleCard();

			const albumDetail = new AlbumDetailPage(browser);
			await albumDetail.waitForTrackRowsVisible();
			await albumDetail.DetailHeader().tapPlayButton();
		},
		act: async () => {
			const albumDetail = new AlbumDetailPage(browser);
			await albumDetail.openTrackContextMenuOnFirstVisibleRow();
		},
	},
	{
		label: 'playlist detail',
		arrange: async () => {
			const library = new LibraryPage(browser);
			await library.openPlaylistsTab();
			await library.tabs.playlists.waitForLoad();
			await library.tabs.playlists.tapFirstVisibleCard();
			const playlistDetail = new PlaylistDetailPage(browser);
			await playlistDetail.waitForTrackRowsVisible();
			await playlistDetail.DetailHeader().tapPlayButton();
		},
		act: async () => {
			const playlistDetail = new PlaylistDetailPage(browser);
			await playlistDetail.openTrackContextMenuOnFirstVisibleRow();
		},
	},
	{
		label: 'artist top tracks',
		arrange: async () => {
			const library = new LibraryPage(browser);
			await library.openArtistsTab();
			await library.tabs.artists.waitForLoad();
			await library.tabs.artists.tapFirstVisibleCard();

			const artistDetail = new ArtistDetailPage(browser);
			await artistDetail.waitForTrackRowsVisible();
			await artistDetail.DetailHeader().tapPlayButton();
		},
		act: async () => {
			const artistDetail = new ArtistDetailPage(browser);
			await artistDetail.openTrackContextMenuOnFirstVisibleRow();
		},
	},
	// {
	// 	label: 'search results',
	// 	arrange: async () => {
	// 		const footer = new FooterPage(browser);
	// 		await footer.tapSearch();
	// 		const searchPage = new SearchPage(browser);
	// 		await searchPage.waitForLoad();
	// 		await searchPage.enterSearchQuery('bod');
	// 		await searchPage.waitForTrackResults();
	// 	},
	// 	act: async () => {
	// 		const searchPage = new SearchPage(browser);
	// 		await searchPage.openTrackContextMenuOnFirstVisibleTrackRow();
	// 	},
	// },
	{
		label: 'genre detail',
		arrange: async () => {
			const library = new LibraryPage(browser);
			await library.openGenresTab();
			await library.tabs.genres.waitForLoad();
			await library.tabs.genres.tapFirstVisibleCard();
			const genreDetail = new GenreDetailPage(browser);
			await genreDetail.waitForTrackRowsVisible();
			await genreDetail.DetailHeader().tapPlayButton();
		},
		act: async () => {
			const genreDetail = new GenreDetailPage(browser);
			await genreDetail.openTrackContextMenuOnFirstVisibleRow();
		},
	},
];

for (const testCase of scenarios) {
	describe(`track context menu from ${testCase.label}`, () => {
		beforeEach(async () => {
			const footer = new FooterPage(browser);
			await footer.tapLibrary();
			const library = new LibraryPage(browser);
			await library.waitForLoad();

			await testCase.arrange();
		});

		afterEach(async () => {
			const nowPlaying = new NowPlayingBar(browser);
			await nowPlaying.swipeAwayIfVisible();

			const footer = new FooterPage(browser);
			await footer.tapHome();
		});

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
			const trackTitle = await menu.getTrackTitle();
			await menu.tapAddToQueue();
			await menu.waitForHidden();
			const nowPlaying = new NowPlayingBar(browser);
			await nowPlaying.waitForVisible();
			await nowPlaying.openExpandedSurface();
			await nowPlaying.tapUpNextTab();
			await nowPlaying.waitForQueueRowsVisible();
			expect(await nowPlaying.lastUpNextTrackName()).toBe(trackTitle);
			await nowPlaying.collapseExpandedIfVisible();
		});

		it('dismisses after play next', async () => {
			await testCase.act();
			const menu = new TrackContextMenu(browser);
			await menu.waitForVisible();
			const trackTitle = await menu.getTrackTitle();
			await menu.tapPlayNext();
			await menu.waitForHidden();
			const nowPlaying = new NowPlayingBar(browser);
			await nowPlaying.waitForVisible();
			await nowPlaying.openExpandedSurface();
			await nowPlaying.tapUpNextTab();
			await nowPlaying.waitForQueueRowsVisible();
			expect(await nowPlaying.firstUpNextTrackName()).toBe(trackTitle);
			await nowPlaying.collapseExpandedIfVisible();
		});

		it('opens the artist when tapping on the artist header', async () => {
			await testCase.act();
			const menu = new TrackContextMenu(browser);
			await menu.waitForVisible();
			await menu.tapArtist();
			await menu.waitForHidden();
			const artistDetail = new ArtistDetailPage(browser);
			await artistDetail.waitForLoad();
			await artistDetail.swipeBack();
		});

		it('opens the album when tapping on the album track row', async () => {
			await testCase.act();
			const menu = new TrackContextMenu(browser);
			await menu.waitForVisible();
			await menu.tapAlbumRow();
			await menu.waitForHidden();
			const albumDetail = new AlbumDetailPage(browser);
			await albumDetail.waitForLoad();
		});
	});
}
