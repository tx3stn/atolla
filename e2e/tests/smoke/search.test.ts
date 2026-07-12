import { FooterPage } from '../../pages/Footer';
import { LibraryPage } from '../../pages/LibraryPage';
import { SearchPage } from '../../pages/SearchPage';

describe('search', () => {
	let footer: FooterPage;
	let library: LibraryPage;
	let searchPage: SearchPage;

	before(() => {
		footer = new FooterPage(browser);
		library = new LibraryPage(browser);
		searchPage = new SearchPage(browser);
	});

	beforeEach(async () => {
		if (await searchPage.isVisible()) {
			await searchPage.dismissKeyboard();
		}
	});

	it('shows search view when tapping the search tab', async () => {
		await footer.tapSearch();
		await searchPage.waitForLoad();
		expect(await searchPage.isVisible()).toBe(true);
	});

	it('accepts a search query and shows result cards', async () => {
		await searchPage.enterSearchQuery('a');
		expect(await searchPage.waitForAnyResultCard()).toBe(true);
	});

	it('shows search view after navigating away and back', async () => {
		await footer.tapLibrary();
		await library.waitForLoad();
		await footer.tapSearch();
		await searchPage.waitForLoad();

		expect(await searchPage.isVisible()).toBe(true);
	});
});
