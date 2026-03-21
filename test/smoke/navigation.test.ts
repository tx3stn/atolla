import { AlbumDetailPage } from '../pages/AlbumDetailPage';
import { ArtistDetailPage } from '../pages/ArtistDetailPage';
import { FooterPage } from '../pages/Footer';
import { HomePage } from '../pages/HomePage';
import { PlaylistDetailPage } from '../pages/PlaylistDetailPage';
import { SearchPage } from '../pages/SearchPage';
import { SettingsPage } from '../pages/SettingsPage';

describe('footer navigation', () => {
	let footer: FooterPage;
	let home: HomePage;

	before(async () => {
		const packageName = (await browser.execute('mobile: getCurrentPackage')) as string;
		const state = (await browser.execute('mobile: queryAppState', {
			appId: packageName,
		})) as number;
		if (state > 1) {
			await browser.terminateApp(packageName);
		}
		await browser.activateApp(packageName);

		home = new HomePage(browser);
		await home.waitForLoad();
	});

	beforeEach(async () => {
		footer = new FooterPage(browser);
		await footer.tapHome();

		home = new HomePage(browser);
		await home.waitForLoad();
	});

	it('should load search view when tapping search tab', async () => {
		const searchPage = new SearchPage(browser);

		await footer.tapSearch();
		await searchPage.waitForLoad();

		expect(await searchPage.isVisible()).toBe(true);
	});

	it('should load settings view when tapping settings tab', async () => {
		const settingsPage = new SettingsPage(browser);

		await footer.tapSettings();
		await settingsPage.waitForLoad();

		expect(await settingsPage.isVisible()).toBe(true);
	});

	it('should load the albums grid on the albums tab', async () => {
		await home.tapHeaderAlbums();
		await home.waitForAlbumsTab();
		expect(await home.albumsGridIsVisible()).toBe(true);
	});

	it('should swipe back to artists grid after opening artist via header tab', async () => {
		const artistDetailPage = new ArtistDetailPage(browser);

		await home.tapHeaderArtists();
		await home.waitForArtistsTab();

		await home.tapCardByID('artist-1');
		await artistDetailPage.waitForLoad();

		await home.swipeBack();
		await home.waitForArtistsTab();

		expect(await home.artistGridIsVisible()).toBe(true);
	});

	it('should swipe back to albums grid after opening album via header tab', async () => {
		const albumDetailPage = new AlbumDetailPage(browser);

		await home.tapHeaderAlbums();
		await home.waitForAlbumsTab();

		await home.tapCardByID('album-1');
		await albumDetailPage.waitForLoad();

		await home.swipeBack();
		await home.waitForAlbumsTab();

		expect(await home.albumsGridIsVisible()).toBe(true);
	});

	it('should swipe back to playlists grid after opening playlist via header tab', async () => {
		const playlistDetailPage = new PlaylistDetailPage(browser);

		await home.tapHeaderPlaylists();
		await home.waitForPlaylistsTab();

		await home.tapCardByID('playlist-1');
		await playlistDetailPage.waitForLoad();

		await home.swipeBack();
		await home.waitForPlaylistsTab();

		expect(await home.playlistsGridIsVisible()).toBe(true);
	});
});
