import { AlbumDetailPage } from '../../pages/AlbumDetailPage';
import { FooterPage } from '../../pages/Footer';
import { LibraryPage } from '../../pages/LibraryPage';
import { NowPlayingBar } from '../../pages/NowPlayingBar';
import { PlaylistDetailPage } from '../../pages/PlaylistDetailPage';

describe('playlist reorder', () => {
	let playlistDetail: PlaylistDetailPage;

	beforeEach(async () => {
		const footer = new FooterPage(browser);
		await footer.tapLibrary();

		const library = new LibraryPage(browser);
		await library.waitForLoad();
		await library.openPlaylistsTab();
		await library.tabs.playlists.tapFirstVisibleCard();

		playlistDetail = new PlaylistDetailPage(browser);
		await playlistDetail.waitForTrackRowsVisible();
	});

	it('swaps the first two tracks when the first row is dragged below the second', async () => {
		const before = await playlistDetail.visibleTrackTitles();
		expect(before.length).toBeGreaterThan(1);

		await playlistDetail.reorderFirstRowBelowSecond();

		await browser.waitUntil(
			async () => {
				const after = await playlistDetail.visibleTrackTitles();
				return after[0] === before[1] && after[1] === before[0];
			},
			{ timeoutMsg: 'Playlist rows did not swap after dragging the first row below the second' },
		);
	});
});

describe('now playing queue reorder', () => {
	let nowPlaying: NowPlayingBar;

	before(async () => {
		nowPlaying = new NowPlayingBar(browser);
		const albumDetail = new AlbumDetailPage(browser);

		const footer = new FooterPage(browser);
		await footer.tapLibrary();

		const library = new LibraryPage(browser);
		await library.waitForLoad();
		await library.openAlbumsTab();
		await library.tabs.albums.waitForLoad();
		await library.tabs.albums.tapCardByID('album-24');

		await albumDetail.waitForLoad();
		await albumDetail.waitForTrackRowsVisible();
		await albumDetail.DetailHeader().tapPlayButton();

		await nowPlaying.waitForVisible();
		await nowPlaying.openExpandedSurface();
		await nowPlaying.tapUpNextTab();
		await nowPlaying.waitForQueueRowsVisible();
	});

	after(async () => {
		await nowPlaying?.collapseExpandedIfVisible();
		await nowPlaying?.swipeAwayIfVisible();
	});

	it('moves the first up next track below the second when its row is dragged down', async () => {
		const before = await nowPlaying.upNextTrackNames();
		expect(before.length).toBeGreaterThan(1);

		await nowPlaying.reorderFirstUpNextRowBelowSecond();

		// The drag can settle one or two rows down depending on timing, so assert the
		// behaviour that matters: the first track now sits below the original second.
		await browser.waitUntil(
			async () => {
				const after = await nowPlaying.upNextTrackNames();
				const firstIndex = after.indexOf(before[0]);
				const secondIndex = after.indexOf(before[1]);
				return secondIndex !== -1 && firstIndex > secondIndex;
			},
			{ timeoutMsg: 'First up next track was not moved below the second after dragging' },
		);
	});
});
