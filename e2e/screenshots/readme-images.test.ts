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
});
