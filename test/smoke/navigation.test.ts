import { AlbumDetailPage } from '../pages/AlbumDetailPage';
import { ArtistDetailPage } from '../pages/ArtistDetailPage';
import { FooterPage } from '../pages/Footer';
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
		await searchPage.dismissKeyboard();
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
});

describe('header tab navigation', () => {
	let artistDetailPage: ArtistDetailPage;
	let albumDetailPage: AlbumDetailPage;
	let playlistDetailPage: PlaylistDetailPage;
	let footer: FooterPage;
	let home: LibraryPage;

	before(() => {
		artistDetailPage = new ArtistDetailPage(browser);
		albumDetailPage = new AlbumDetailPage(browser);
		playlistDetailPage = new PlaylistDetailPage(browser);
	});

	beforeEach(async () => {
		footer = new FooterPage(browser);
		await footer.tapLibrary();

		home = new LibraryPage(browser);
		await home.waitForLoad();
	});

	it('should close artist detail view when tapping the artist header tab', async () => {
		await home.openArtistsTab();
		await home.tabs.artists.tapFirstVisibleCard();
		await artistDetailPage.waitForLoad();
		await artistDetailPage.DetailHeader().swipeDownToRevealHeader();
		await artistDetailPage.DetailHeader().tapArtistsTab();
		expect(await home.tabs.artists.isVisible()).toBe(true);
	});

	it('should close album detail view when tapping the album header tab', async () => {
		await home.openAlbumsTab();
		await home.tabs.albums.tapFirstVisibleCard();
		await albumDetailPage.waitForLoad();
		await albumDetailPage.DetailHeader().swipeDownToRevealHeader();
		await albumDetailPage.DetailHeader().tapAlbumsTab();
		expect(await home.tabs.albums.isVisible()).toBe(true);
	});

	it('should close playlist detail view when tapping the playlist header tab', async () => {
		await home.openPlaylistsTab();
		await home.tabs.playlists.tapFirstVisibleCard();
		await playlistDetailPage.waitForLoad();
		await playlistDetailPage.DetailHeader().swipeDownToRevealHeader();
		await playlistDetailPage.DetailHeader().tapPlaylistsTab();
		expect(await home.tabs.playlists.isVisible()).toBe(true);
	});
});
