import { AlbumDetailPage } from '../pages/AlbumDetailPage';
import { ArtistDetailPage } from '../pages/ArtistDetailPage';
import { FooterPage } from '../pages/Footer';
import { GenreDetailPage } from '../pages/GenreDetailPage';
import { HomePage } from '../pages/HomePage';
import { LibraryPage } from '../pages/LibraryPage';
import { NowPlayingBar } from '../pages/NowPlayingBar';
import { SearchPage } from '../pages/SearchPage';
import { SettingsPage } from '../pages/SettingsPage';
import { saveCapture } from './captures';

const ARTIST = 'Deafheaven';
const ALBUM = 'Jane Doe';
const GENRE = 'Black Metal';
const PLAYER_ALBUM = 'ULTRAPOP';
const SEARCH_QUERY = 'converge';

// the track behind each shot, matching what the readme currently shows. search and genre are
// captured before anything plays, because the readme has no now playing bar on either
const ALBUM_TRACK = 'Homewrecker';
const PLAYER_TRACK = 'AN ITERATION';
const LIBRARY_TRACK = 'I Am Champagne and You Are Shit';
const HOME_TRACK = 'Blackberry Marmalade';
const SETTINGS_TRACK = 'Love Is Political';

// how far into each track playback is nudged before capturing, so the progress bar reads as a
// filled section rather than a bare one. deliberately uneven, so the set doesn't look staged
const ARTIST_SEEK = 0.35;
const LIBRARY_SEEK = 0.55;
const HOME_SEEK = 0.2;
const SETTINGS_SEEK = 0.45;
const ALBUM_SEEK = 0.3;
const PLAYER_SEEK = 0.75;

// how far each `-scrolled` companion travels, tuned to how much sits above the section it reaches
const HOME_SCROLLS = 2;
const ARTIST_SCROLLS = 3;
const ALBUM_SCROLLS = 2;

async function scrollDownBy(page: { scrollDown(): Promise<void> }, times: number): Promise<void> {
	for (let scroll = 0; scroll < times; scroll += 1) {
		await page.scrollDown();
	}
}

async function search(query: string): Promise<SearchPage> {
	await new FooterPage(browser).tapSearch();

	const page = new SearchPage(browser);
	await page.waitForLoad();
	await page.enterSearchQuery(query);
	await page.dismissKeyboard();
	return page;
}

async function openSearchedCard(title: string): Promise<void> {
	const page = await search(title);
	await page.waitForAnyResultCard();
	await page.tapCardByTitle(title);
}

// searching the track name reaches it without needing to know which album it is on
async function playTrack(title: string, seek: number): Promise<void> {
	const page = await search(title);
	await page.waitForTrackResults();
	await page.tapTrackByTitle(title);
	await settleProgress(seek);
}

// the collapsed bar opens the surface when tapped rather than seeking, so the progress bar can
// only be moved while expanded
async function settleProgress(seek: number): Promise<void> {
	const nowPlaying = new NowPlayingBar(browser);
	await nowPlaying.waitForVisible();
	await nowPlaying.openExpandedSurface();
	await nowPlaying.seekToRatio(seek);
	await nowPlaying.collapseExpandedIfVisible();
}

describe('capture readme images', () => {
	// the app restores its play queue on launch, so the bar is already up before anything is played
	before(async () => {
		await new NowPlayingBar(browser).swipeAwayIfVisible();
	});

	it('search', async () => {
		await search(SEARCH_QUERY);
		await new SearchPage(browser).waitForAnyResultCard();

		await saveCapture('search');
	});

	it('genre', async () => {
		await new FooterPage(browser).tapLibrary();

		const library = new LibraryPage(browser);
		await library.waitForLoad();
		await library.openGenresTab();
		await library.tabs.genres.tapCardByTitle(GENRE);

		const genre = new GenreDetailPage(browser);
		await genre.waitForTrackRowsVisible();

		await saveCapture('genre');
	});

	it('artist', async () => {
		await openSearchedCard(ARTIST);

		const artist = new ArtistDetailPage(browser);
		await artist.waitForAlbumsVisible();
		await artist.DetailHeader().tapPlayButton();
		await settleProgress(ARTIST_SEEK);
		await saveCapture('artist');

		await scrollDownBy(artist, ARTIST_SCROLLS);
		await saveCapture('artist-scrolled');
	});

	it('library', async () => {
		await playTrack(LIBRARY_TRACK, LIBRARY_SEEK);
		await new FooterPage(browser).tapLibrary();

		const library = new LibraryPage(browser);
		await library.waitForLoad();
		await library.openArtistsTab();

		await saveCapture('library');
	});

	it('home', async () => {
		await playTrack(HOME_TRACK, HOME_SEEK);
		await new FooterPage(browser).tapHome();

		const home = new HomePage(browser);
		await home.waitForVisible();
		await saveCapture('home');

		await playTrack(SETTINGS_TRACK, SETTINGS_SEEK);
		await new FooterPage(browser).tapHome();
		await home.waitForVisible();
		await scrollDownBy(home, HOME_SCROLLS);
		await saveCapture('home-scrolled');
	});

	it('settings', async () => {
		await new FooterPage(browser).tapSettings();

		const settings = new SettingsPage(browser);
		await settings.waitForLoad();

		await saveCapture('settings');
	});

	it('album', async () => {
		await openSearchedCard(ALBUM);

		const album = new AlbumDetailPage(browser);
		await album.waitForTrackRowsVisible();
		await album.tapTrackByTitle(ALBUM_TRACK);
		await settleProgress(ALBUM_SEEK);
		await saveCapture('album');

		await scrollDownBy(album, ALBUM_SCROLLS);
		await saveCapture('album-scrolled');
	});

	// last: the only capture that leaves the expanded surface covering the screen
	it('player', async () => {
		await openSearchedCard(PLAYER_ALBUM);

		const album = new AlbumDetailPage(browser);
		await album.waitForTrackRowsVisible();
		await album.tapTrackByTitle(PLAYER_TRACK);

		const nowPlaying = new NowPlayingBar(browser);
		await nowPlaying.waitForVisible();
		await nowPlaying.openExpandedSurface();
		await nowPlaying.seekToRatio(PLAYER_SEEK);
		await saveCapture('player');

		await nowPlaying.swipeTracksIntoView();
		await saveCapture('player-queue');
	});
});
