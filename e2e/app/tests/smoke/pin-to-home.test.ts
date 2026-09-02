import { CardContextMenu } from '../../pages/CardContextMenuModal';
import { FooterPage } from '../../pages/Footer';
import { HomePage } from '../../pages/HomePage';
import { LibraryPage } from '../../pages/LibraryPage';

// picked to sit on the Albums tab's first screen without scrolling (7th-newest by premiere
// date, just past the 6 albums Home's own "Recently Added" section shows, so it can't collide
// with that section's card ids either)
const ALBUM_ID = 'album-16'; // Perfect Saviors
const ARTIST_ID = 'artist-4'; // HEALTH
const PLAYLIST_ID = 'playlist-2'; // Late Night Heavy
const GENRE_ID = 'genre-12'; // Shoegaze

const PIN_ORDER = [ARTIST_ID, ALBUM_ID, PLAYLIST_ID, GENRE_ID];
const HOME_ORDER = [...PIN_ORDER].reverse();

const cardId = (id: string): string => `card-${id}`;

describe('pin to home', () => {
	// the app isn't reset between spec runs, so a prior (partial or manual) run can leave our
	// fixtures pinned; without this, re-running the suite would toggle them back off instead of
	// pinning them, and the order assertion below would see the wrong cards (or none)
	it('starts with none of the test fixtures pinned', async () => {
		const footer = new FooterPage(browser);
		const home = new HomePage(browser);
		const menu = new CardContextMenu(browser);

		await footer.tapHome();
		await home.waitForLoad();

		for (const id of PIN_ORDER) {
			if (!(await home.elementByID(cardId(id)).isExisting())) {
				continue;
			}

			await home.longPressPinnedCardByID(id);
			await menu.waitForVisible();
			await menu.tapPin();
			await menu.waitForHidden();
		}
	});

	it('pins the artist from the Artists tab', async () => {
		const footer = new FooterPage(browser);
		const library = new LibraryPage(browser);
		const menu = new CardContextMenu(browser);

		await footer.tapLibrary();
		await library.waitForLoad();
		await library.openArtistsTab();
		await library.tabs.artists.longPressCardByID(ARTIST_ID);
		await menu.waitForVisible();
		await menu.tapPin();
		await menu.waitForHidden();
	});

	it('pins the album from the Albums tab', async () => {
		const footer = new FooterPage(browser);
		const library = new LibraryPage(browser);
		const menu = new CardContextMenu(browser);

		await footer.tapLibrary();
		await library.waitForLoad();
		await library.openAlbumsTab();
		await library.tabs.albums.longPressCardByID(ALBUM_ID);
		await menu.waitForVisible();
		await menu.tapPin();
		await menu.waitForHidden();
	});

	it('pins the playlist from the Playlists tab', async () => {
		const library = new LibraryPage(browser);
		const menu = new CardContextMenu(browser);

		await library.openPlaylistsTab();
		await library.tabs.playlists.longPressCardByID(PLAYLIST_ID);
		await menu.waitForVisible();
		await menu.tapPin();
		await menu.waitForHidden();
	});

	it('pins the genre from the Genres tab', async () => {
		const library = new LibraryPage(browser);
		const menu = new CardContextMenu(browser);

		await library.openGenresTab();
		await library.tabs.genres.longPressCardByID(GENRE_ID);
		await menu.waitForVisible();
		await menu.tapPin();
		await menu.waitForHidden();
	});

	it('shows every pinned kind on Home in most-recently-pinned-first order', async () => {
		const footer = new FooterPage(browser);
		const home = new HomePage(browser);

		await footer.tapHome();
		await home.waitForLoad();
		await home.waitForPinnedCards();

		expect(await home.pinnedCardOrder(PIN_ORDER)).toEqual(HOME_ORDER.map(cardId));
	});

	it('removes each card once unpinned, ending in the empty state', async () => {
		const home = new HomePage(browser);
		const menu = new CardContextMenu(browser);

		for (const [index, id] of HOME_ORDER.entries()) {
			await home.longPressPinnedCardByID(id);
			await menu.waitForVisible();
			await menu.tapPin();
			await menu.waitForHidden();

			if (index === HOME_ORDER.length - 1) {
				await home.waitForNoPinnedCards();
				continue;
			}

			await browser.waitUntil(async () => !(await home.elementByID(cardId(id)).isExisting()), {
				timeoutMsg: `Expected ${cardId(id)} to be removed from the pinned grid after unpinning`,
			});
		}
	});
});
