import { FooterPage } from '../pages/Footer';
import { SearchPage } from '../pages/SearchPage';

describe('search', () => {
	let footer: FooterPage;
	let searchPage: SearchPage;

	before(() => {
		footer = new FooterPage(browser);
		searchPage = new SearchPage(browser);
	});

	beforeEach(async () => {
		// Dismiss keyboard if it is up from a previous test before trying to tap the footer
		try {
			await browser.hideKeyboard();
		} catch {
			// Keyboard already hidden or platform does not support this call
		}
	});

	it('shows search view when tapping the search tab', async () => {
		await footer.tapSearchAndWaitForLoad();
		await searchPage.waitForLoad();
		expect(await searchPage.isVisible()).toBe(true);
	});

	it('accepts a search query and shows result cards', async () => {
		await searchPage.enterSearchQuery('a');
		await searchPage.waitForAnyResultCard();

		expect(await searchPage.isVisible()).toBe(true);
	});

	it('shows search view after navigating away and back', async () => {
		await footer.tapLibrary();
		await footer.tapSearchAndWaitForLoad();
		await searchPage.waitForLoad();

		expect(await searchPage.isVisible()).toBe(true);
	});
});
