import { AlbumDetailPage } from '../pages/AlbumDetailPage';
import { ArtistDetailPage } from '../pages/ArtistDetailPage';
import { FooterPage } from '../pages/Footer';
import { GenreDetailPage } from '../pages/GenreDetailPage';
import { HomePage } from '../pages/HomePage';
import { LibraryPage } from '../pages/LibraryPage';
import { NowPlayingBar } from '../pages/NowPlayingBar';
import { SearchPage } from '../pages/SearchPage';

// opening a header tab pops any pushed detail, so this always lands on the albums grid
async function openLibraryGrid(): Promise<LibraryPage> {
	const footer = new FooterPage(browser);
	await footer.tapLibrary();

	const library = new LibraryPage(browser);
	await library.waitForLoad();
	await library.openAlbumsTab();
	return library;
}

describe('capture readme images', () => {
	beforeEach(async () => {
		const footer = new FooterPage(browser);
		await footer.tapHome();
		await new HomePage(browser).waitForLoad();
	});

	it('search', async () => {
		const footer = new FooterPage(browser);
		await footer.tapSearch();

		const search = new SearchPage(browser);
		await search.waitForLoad();
		await search.enterSearchQuery('converge');
		await search.waitForAnyResultCard();

		await browser.saveScreenshot('./search.png');
	});

	it('library', async () => {
		await openLibraryGrid();

		await browser.saveScreenshot('./library.png');
	});

	it('album', async () => {
		const library = await openLibraryGrid();
		await library.tabs.albums.tapFirstVisibleCard();

		const album = new AlbumDetailPage(browser);
		await album.waitForTrackRowsVisible();

		await browser.saveScreenshot('./album.png');
	});

	it('genre', async () => {
		const library = await openLibraryGrid();
		await library.openGenresTab();
		await library.tabs.genres.tapFirstVisibleCard();

		const genre = new GenreDetailPage(browser);
		await genre.waitForTrackRowsVisible();

		await browser.saveScreenshot('./genre.png');
	});

	it('artist', async () => {
		const library = await openLibraryGrid();
		await library.openArtistsTab();
		await library.tabs.artists.tapFirstVisibleCard();

		const artist = new ArtistDetailPage(browser);
		await artist.waitForTrackRowsVisible();
		await browser.saveScreenshot('./artist.png');

		await artist.scrollDown();
		await browser.saveScreenshot('./artist-scrolled.png');
	});

	it('home', async () => {
		const footer = new FooterPage(browser);
		await footer.tapHome();

		const home = new HomePage(browser);
		await home.waitForAlbumCards();
		await browser.saveScreenshot('./home.png');

		await home.scrollDown();
		await home.scrollDown();
		await browser.saveScreenshot('./home-scrolled.png');
	});

	// starts playback, so this stays last: the now playing bar overlays every other screen
	it('player', async () => {
		const library = await openLibraryGrid();
		await library.tabs.albums.tapFirstVisibleCard();

		const album = new AlbumDetailPage(browser);
		await album.waitForTrackRowsVisible();
		await album.DetailHeader().tapPlayButton();

		const nowPlaying = new NowPlayingBar(browser);
		await nowPlaying.waitForVisible();
		await nowPlaying.openExpandedSurface();
		await browser.saveScreenshot('./player.png');

		await nowPlaying.swipeTracksIntoView();
		await browser.saveScreenshot('./player-queue.png');
	});
});
