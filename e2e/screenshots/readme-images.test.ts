import { FooterPage } from '../pages/Footer';
import { SearchPage } from '../pages/SearchPage';

describe('capture readme images', () => {
	it('search', async () => {
		const footer = new FooterPage(browser);
		await footer.tapSearch();

		const search = new SearchPage(browser);
		await search.waitForLoad();
		await search.enterSearchQuery('converge');
		await search.waitForAnyResultCard();

		await browser.saveScreenshot('./search.png');
	});
	// TODO: add the following:
	// genre view
	// library view
	// album view
	// artist view (scrolled to show all - 2 pics)
	// home tab (scrolled to show all - 2 pics)
	// player (scrolled to show all - 2 pics)
});
