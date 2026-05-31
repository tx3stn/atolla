import { LibraryPage } from '../../../pages/LibraryPage';
import { PlaylistDetailPage } from '../../../pages/PlaylistDetailPage';
import { defineTrackContextMenuSuite } from './shared';

defineTrackContextMenuSuite({
	act: async () => {
		const playlistDetail = new PlaylistDetailPage(browser);
		await playlistDetail.openTrackContextMenuOnFirstVisibleRow();
	},
	arrange: async () => {
		const library = new LibraryPage(browser);
		await library.openPlaylistsTab();
		await library.tabs.playlists.waitForLoad();
		await library.tabs.playlists.tapFirstVisibleCard();
		const playlistDetail = new PlaylistDetailPage(browser);
		await playlistDetail.waitForTrackRowsVisible();
		await playlistDetail.DetailHeader().tapPlayButton();
	},
	label: 'playlist detail',
});
