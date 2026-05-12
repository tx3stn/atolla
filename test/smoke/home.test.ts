import { FooterPage } from '../pages/Footer';
import { HomePage } from '../pages/HomePage';

describe('home screen', () => {
	let footer: FooterPage;
	let home: HomePage;

	beforeEach(async () => {
		footer = new FooterPage(browser);
		home = new HomePage(browser);

		await footer.tapHome();
		await home.waitForLoad();
	});

	it('should show album cards after pull-to-refresh', async () => {
		await home.pullToRefresh();

		const hasCards = await home.hasAlbumCards(8_000);
		expect(hasCards).toBe(true);
	});

	it('should still display home view after pull-to-refresh', async () => {
		await home.pullToRefresh();
		await home.waitForLoad();

		expect(await home.isDisplayed()).toBe(true);
	});
});
