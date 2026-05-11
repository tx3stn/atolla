import { AlbumDetailPage } from '../pages/AlbumDetailPage';
import { ArtistDetailPage } from '../pages/ArtistDetailPage';
import { FooterPage } from '../pages/Footer';
import { HomePage } from '../pages/HomePage';
import { LibraryPage } from '../pages/LibraryPage';
import { PlaylistDetailPage } from '../pages/PlaylistDetailPage';

describe('back navigation', () => {
	let footer: FooterPage;
	let library: LibraryPage;

	beforeEach(async () => {
		footer = new FooterPage(browser);
		await footer.tapLibrary();

		library = new LibraryPage(browser);
		await library.waitForLoad();
	});

	it('should swipe back to artists grid after opening artist via header tab', async () => {
		const artistDetailPage = new ArtistDetailPage(browser);

		await library.openArtistsTab();
		await library.tabs.artists.tapFirstVisibleCard();
		await artistDetailPage.waitForLoad();

		await library.swipeBack();
		await library.tabs.artists.waitForLoad();

		expect(await library.tabs.artists.isVisible()).toBe(true);
	});

	it('should swipe back to albums grid after opening album via header tab', async () => {
		const albumDetailPage = new AlbumDetailPage(browser);

		await library.openAlbumsTab();
		await library.tabs.albums.tapFirstVisibleCard();
		await albumDetailPage.waitForLoad();

		await library.swipeBack();
		await library.tabs.albums.waitForLoad();

		expect(await library.tabs.albums.isVisible()).toBe(true);
	});

	it('should return to home when swiping back from an album opened on home', async () => {
		const albumDetailPage = new AlbumDetailPage(browser);
		const homePage = new HomePage(browser);

		await footer.tapHome();
		await homePage.waitForLoad();
		await homePage.tapFirstVisibleAlbumCard();
		await albumDetailPage.waitForLoad();

		await homePage.swipeBack();
		await homePage.waitForLoad();

		expect(await homePage.isDisplayed()).toBe(true);
	});

	it('should swipe back to playlists grid after opening playlist via header tab', async () => {
		const playlistDetailPage = new PlaylistDetailPage(browser);

		await library.openPlaylistsTab();
		await library.tabs.playlists.tapFirstVisibleCard();
		await playlistDetailPage.waitForLoad();

		await library.swipeBack();
		await library.tabs.playlists.waitForLoad();

		expect(await library.tabs.playlists.isVisible()).toBe(true);
	});

	it('should keep playlists back navigation working after artist and album navigation', async () => {
		const artistDetailPage = new ArtistDetailPage(browser);
		const albumDetailPage = new AlbumDetailPage(browser);
		const playlistDetailPage = new PlaylistDetailPage(browser);

		await library.openArtistsTab();
		await library.tabs.artists.tapFirstVisibleCard();
		await artistDetailPage.waitForLoad();

		await library.tabs.albums.tapFirstVisibleCard();
		await albumDetailPage.waitForLoad();

		await albumDetailPage.DetailHeader().swipeDownToRevealHeader();
		await albumDetailPage.DetailHeader().tapPlaylistsTab();

		await library.tabs.playlists.tapFirstVisibleCard();
		await playlistDetailPage.waitForLoad();

		await library.swipeBack();
		await library.tabs.playlists.waitForLoad();

		expect(await library.tabs.playlists.isVisible()).toBe(true);
	});
});
