import { AlbumDetailPage } from '../pages/AlbumDetailPage';
import { ArtistDetailPage } from '../pages/ArtistDetailPage';
import { FooterPage } from '../pages/Footer';
import { HomePage } from '../pages/HomePage';
import { LibraryPage } from '../pages/LibraryPage';
import { PlaylistDetailPage } from '../pages/PlaylistDetailPage';
import { SearchPage } from '../pages/SearchPage';
import { SettingsPage } from '../pages/SettingsPage';

describe('footer navigation', () => {
	let footer: FooterPage;
	let home: LibraryPage;

	beforeEach(async () => {
		footer = new FooterPage(browser);
		await footer.tapLibrary();

		home = new LibraryPage(browser);
		await home.waitForLoad();
	});

	it('should load search view when tapping search tab', async () => {
		const searchPage = new SearchPage(browser);

		await footer.tapSearchAndWaitForLoad();
		await searchPage.waitForLoad();

		expect(await searchPage.isVisible()).toBe(true);
		try {
			await browser.hideKeyboard();
		} catch {
			// keyboard already closed or unsupported in this context
		}
	});

	it('should load settings view when tapping settings tab', async () => {
		const settingsPage = new SettingsPage(browser);

		await footer.tapSettings();
		await settingsPage.waitForLoad();

		expect(await settingsPage.isVisible()).toBe(true);
	});

	it('should load the albums grid on the albums tab', async () => {
		await home.openAlbumsTab();
		expect(await home.tabs.albums.isVisible()).toBe(true);
	});

	describe('should close open detail view when tapping the matching header tab', () => {
		const artistDetailPage = new ArtistDetailPage(browser);
		const albumDetailPage = new AlbumDetailPage(browser);
		const playlistDetailPage = new PlaylistDetailPage(browser);

		it('artists', async () => {
			await home.tabs.artists.tapFirstVisibleCard();
			await artistDetailPage.waitForLoad();
			await home.openArtistsTab();
			expect(await home.tabs.artists.isVisible()).toBe(true);
		});

		it('albums', async () => {
			await home.openAlbumsTab();
			await home.tabs.albums.tapFirstVisibleCard();
			await albumDetailPage.waitForLoad();
			await home.openAlbumsTab();
			expect(await home.tabs.albums.isVisible()).toBe(true);
		});

		it('playlist', async () => {
			await home.openPlaylistsTab();
			await home.tabs.playlists.tapFirstVisibleCard();
			await playlistDetailPage.waitForLoad();
			await home.openPlaylistsTab();
			expect(await home.tabs.playlists.isVisible()).toBe(true);
		});
	});
});

describe('back navigation', () => {
	let footer: FooterPage;
	let home: LibraryPage;

	beforeEach(async () => {
		footer = new FooterPage(browser);
		await footer.tapLibrary();

		home = new LibraryPage(browser);
		await home.waitForLoad();
	});

	it('should swipe back to artists grid after opening artist via header tab', async () => {
		const artistDetailPage = new ArtistDetailPage(browser);

		await home.openArtistsTab();
		await home.tabs.artists.tapFirstVisibleCard();
		await artistDetailPage.waitForLoad();

		await home.swipeBack();
		await home.tabs.artists.waitForLoad();

		expect(await home.tabs.artists.isVisible()).toBe(true);
	});

	it('should swipe back to albums grid after opening album via header tab', async () => {
		const albumDetailPage = new AlbumDetailPage(browser);

		await home.openAlbumsTab();
		await home.tabs.albums.tapFirstVisibleCard();
		await albumDetailPage.waitForLoad();

		await home.swipeBack();
		await home.tabs.albums.waitForLoad();

		expect(await home.tabs.albums.isVisible()).toBe(true);
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

		expect(await homePage.elementByID('home-view').isDisplayed()).toBe(true);
	});

	it('should swipe back to playlists grid after opening playlist via header tab', async () => {
		const playlistDetailPage = new PlaylistDetailPage(browser);

		await home.openPlaylistsTab();
		await home.tabs.playlists.tapFirstVisibleCard();
		await playlistDetailPage.waitForLoad();

		await home.swipeBack();
		await home.tabs.playlists.waitForLoad();

		expect(await home.tabs.playlists.isVisible()).toBe(true);
	});

	it('should keep playlists back navigation working after artist and album navigation', async () => {
		const artistDetailPage = new ArtistDetailPage(browser);
		const albumDetailPage = new AlbumDetailPage(browser);
		const playlistDetailPage = new PlaylistDetailPage(browser);

		await home.openArtistsTab();
		await home.tabs.artists.tapFirstVisibleCard();
		await artistDetailPage.waitForLoad();

		await home.tabs.albums.tapFirstVisibleCard();
		await albumDetailPage.waitForLoad();

		await home.openPlaylistsTab();
		await home.tabs.playlists.tapFirstVisibleCard();
		await playlistDetailPage.waitForLoad();

		await home.swipeBack();
		await home.tabs.playlists.waitForLoad();

		expect(await home.tabs.playlists.isVisible()).toBe(true);
	});
});
