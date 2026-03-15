import { FooterPage } from '../pages/Footer';
import { HomePage } from '../pages/HomePage';
import { SearchPage } from '../pages/SearchPage';
import { SettingsPage } from '../pages/SettingsPage';

describe('footer navigation', () => {
	let footer: FooterPage;
	let home: HomePage;

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

		expect(await searchPage.isVisisble()).toBe(true);
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
});
