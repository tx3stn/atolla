import { FooterPage } from '../../pages/Footer';
import { LibraryPage } from '../../pages/LibraryPage';
import { SortNavPanelPage } from '../../pages/SortNavPanelPage';

// `Agriculture` and `The Armed` — the server buckets both under A because it filters on
// its sort name, which drops the leading article
const A_BUCKET_CARD_IDS = ['card-artist-2', 'card-artist-7'];

describe('library A-Z letter filter', () => {
	let library: LibraryPage;
	let panel: SortNavPanelPage;

	beforeEach(async () => {
		const footer = new FooterPage(browser);
		await footer.tapLibrary();

		library = new LibraryPage(browser);
		await library.waitForLoad();
		await library.openArtistsTab();

		panel = new SortNavPanelPage(browser);
		await panel.open();
	});

	it('buckets an artist by its sort name, not its displayed leading article', async () => {
		await panel.tapLetter('A');

		await browser.waitUntil(async () => (await library.tabs.artists.visibleCardIDs()).length > 0, {
			timeoutMsg: 'Timed out waiting for the filtered artists grid',
		});
		const ids = await library.tabs.artists.visibleCardIDs();

		expect(ids.sort()).toEqual(A_BUCKET_CARD_IDS);
	});
});
