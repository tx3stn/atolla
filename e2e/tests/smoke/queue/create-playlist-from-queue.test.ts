import { AlbumDetailPage } from '../../../pages/AlbumDetailPage';
import { CreatePlaylistFromQueueModal } from '../../../pages/CreatePlaylistFromQueueModal';
import { FooterPage } from '../../../pages/Footer';
import { LibraryPage } from '../../../pages/LibraryPage';
import { NowPlayingBar } from '../../../pages/NowPlayingBar';
import { PlaylistDetailPage } from '../../../pages/PlaylistDetailPage';
import { TrackContextMenu } from '../../../pages/TrackContextModal';

interface QueueSnapshot {
	currentName: string;
	firstUpNextName: string;
	playedName: string;
}

describe('create playlist from queue', () => {
	let nowPlaying: NowPlayingBar;
	let modal: CreatePlaylistFromQueueModal;
	let playlistDetail: PlaylistDetailPage;
	let snapshot: QueueSnapshot;

	// plays album-24 then advances one track so the queue has a played (BACK TO) entry, a
	// current track, and remaining UP NEXT tracks, three distinct titles the checkbox
	// scenarios can assert on
	beforeEach(async () => {
		await recoverToLibrary();

		nowPlaying = new NowPlayingBar(browser);
		modal = new CreatePlaylistFromQueueModal(browser);
		playlistDetail = new PlaylistDetailPage(browser);

		const footer = new FooterPage(browser);
		await footer.tapLibrary();

		const library = new LibraryPage(browser);
		await library.waitForLoad();
		await library.openAlbumsTab();
		await library.tabs.albums.tapCardByID('album-24');

		const albumDetail = new AlbumDetailPage(browser);
		await albumDetail.waitForLoad();
		await albumDetail.waitForTrackRowsVisible();
		await albumDetail.DetailHeader().tapPlayButton();

		await nowPlaying.waitForVisible();
		await nowPlaying.openExpandedSurface();
		await nowPlaying.tapUpNextTab();

		// the now-playing-track-name label is the compact bar's and isn't on the expanded
		// surface, so derive the names from the queue rows instead. the first UP NEXT track
		// becomes the current track once we advance
		const currentName = await nowPlaying.firstUpNextTrackName();
		await nowPlaying.tapNext();
		await browser.waitUntil(async () => (await nowPlaying.firstUpNextTrackName()) !== currentName, {
			timeoutMsg: 'Queue did not advance after tapping next',
		});
		const firstUpNextName = await nowPlaying.firstUpNextTrackName();

		// the previously playing track is now the most recent BACK TO entry
		await nowPlaying.tapBackToTab();
		const playedName = await nowPlaying.firstBackToTrackName();

		snapshot = { currentName, firstUpNextName, playedName };
	});

	afterEach(async () => {
		await recoverToLibrary();
	});

	it('includes played, current and up next tracks when both boxes are checked', async () => {
		await nowPlaying.tapCreatePlaylistFromQueue();
		await modal.waitForVisible();
		await modal.enterName(`Queue Playlist ${Date.now()}`);
		await modal.tapCreate();
		await modal.waitForHidden();

		await playlistDetail.waitForTrackRowsVisible();
		const titles = await playlistDetail.visibleTrackTitles();

		expect(titles[0]).toBe(snapshot.playedName);
		expect(titles).toContain(snapshot.currentName);
		expect(titles).toContain(snapshot.firstUpNextName);
	});

	it('excludes already played tracks when that box is unchecked', async () => {
		await nowPlaying.tapCreatePlaylistFromQueue();
		await modal.waitForVisible();
		await modal.enterName(`Queue Playlist ${Date.now()}`);
		await modal.toggleIncludePlayed();
		await modal.tapCreate();
		await modal.waitForHidden();

		await playlistDetail.waitForTrackRowsVisible();
		const titles = await playlistDetail.visibleTrackTitles();

		expect(titles[0]).toBe(snapshot.currentName);
		expect(titles).toContain(snapshot.firstUpNextName);
		expect(titles).not.toContain(snapshot.playedName);
	});

	it('excludes up next tracks when that box is unchecked', async () => {
		await nowPlaying.tapCreatePlaylistFromQueue();
		await modal.waitForVisible();
		await modal.enterName(`Queue Playlist ${Date.now()}`);
		await modal.toggleIncludeUpNext();
		await modal.tapCreate();
		await modal.waitForHidden();

		await playlistDetail.waitForTrackRowsVisible();
		const titles = await playlistDetail.visibleTrackTitles();

		expect(titles).toContain(snapshot.playedName);
		expect(titles).toContain(snapshot.currentName);
		expect(titles).not.toContain(snapshot.firstUpNextName);
	});
});

async function recoverToLibrary(): Promise<void> {
	const nowPlaying = new NowPlayingBar(browser);
	const footer = new FooterPage(browser);
	const menu = new TrackContextMenu(browser);

	try {
		await nowPlaying.collapseExpandedIfVisible();
	} catch {
		// best-effort recovery
	}
	try {
		await nowPlaying.swipeAwayIfVisible();
	} catch {
		// best-effort recovery
	}
	try {
		await menu.dismissIfVisible();
	} catch {
		// best-effort recovery
	}

	if (!(await footer.isVisible())) {
		for (let attempt = 0; attempt < 3; attempt += 1) {
			try {
				await footer.swipeBack();
			} catch {
				// best-effort recovery
			}
			if (await footer.isVisible()) break;
		}
	}

	await footer.tapHome();
}
