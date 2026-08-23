import type { Album } from 'atolla_core/src/models/Album';
import type { Artist } from 'atolla_core/src/models/Artist';
import type { Genre } from 'atolla_core/src/models/Genre';
import type { Playlist } from 'atolla_core/src/models/Playlist';
import type { Transport } from 'atolla_core/src/transports/Transport';
import type { DownloadService } from 'atolla_player/src/services/DownloadService';
import type { PlaylistEditService } from 'atolla_player/src/services/PlaylistEditService';
import type { PlaybackStore } from 'atolla_player/src/stores/Playback';
import type { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';
import type { NavigationController } from 'valdi_navigation/src/NavigationController';
import type { LyricsService } from '../../services/LyricsService';
import type { NetworkStatus } from '../../services/NetworkStatus';
import type { PaletteGenerationQueue } from '../../services/PaletteGenerationQueue';
import type { ToastService } from '../../services/ToastService';
import type { ViewCache } from '../../services/ViewCache';
import { headerStore } from '../../stores/Header';
import type { PinnedItemsStore } from '../../stores/PinnedItems';
import type { Preferences } from '../../stores/Preferences';
import { AlbumView } from '../views/AlbumView';
import { ArtistView } from '../views/ArtistView';
import { GenreView } from '../views/GenreView';
import { PlaylistView } from '../views/PlaylistView';

// the services every detail push needs.
// callers assemble this from their own view model so the push blocks live once.
export interface DetailPushDeps {
	downloadService: DownloadService;
	lyricsService: LyricsService;
	modalSlot: DetachedSlot;
	networkStatus: NetworkStatus;
	onNavigateToArtist?: (artistId: string) => void;
	paletteQueue?: PaletteGenerationQueue;
	pinnedItemsStore?: PinnedItemsStore;
	playbackStore: PlaybackStore;
	playlistEditService?: PlaylistEditService;
	preferences: Preferences;
	toastService: ToastService;
	transport: Transport;
	viewCache: ViewCache;
}

export function pushAlbum(
	controller: NavigationController,
	deps: DetailPushDeps,
	album: Album,
): void {
	controller.push(
		AlbumView,
		{
			album,
			downloadService: deps.downloadService,
			lyricsService: deps.lyricsService,
			modalSlot: deps.modalSlot,
			navigationController: controller,
			networkStatus: deps.networkStatus,
			paletteQueue: deps.paletteQueue,
			pinnedItemsStore: deps.pinnedItemsStore,
			playbackStore: deps.playbackStore,
			preferences: deps.preferences,
			toastService: deps.toastService,
			transport: deps.transport,
			viewCache: deps.viewCache,
		},
		{},
		{ animated: deps.preferences.animationsEnabled },
	);
	headerStore.setVisible(true);
}

export function pushArtist(
	controller: NavigationController,
	deps: DetailPushDeps,
	artist: Artist,
): void {
	controller.push(
		ArtistView,
		{
			artist,
			downloadService: deps.downloadService,
			lyricsService: deps.lyricsService,
			modalSlot: deps.modalSlot,
			navigationController: controller,
			networkStatus: deps.networkStatus,
			paletteQueue: deps.paletteQueue,
			pinnedItemsStore: deps.pinnedItemsStore,
			playbackStore: deps.playbackStore,
			preferences: deps.preferences,
			toastService: deps.toastService,
			transport: deps.transport,
			viewCache: deps.viewCache,
		},
		{},
		{ animated: deps.preferences.animationsEnabled },
	);
	headerStore.setVisible(true);
}

export function pushPlaylist(
	controller: NavigationController,
	deps: DetailPushDeps,
	playlist: Playlist,
): void {
	controller.push(
		PlaylistView,
		{
			downloadService: deps.downloadService,
			lyricsService: deps.lyricsService,
			modalSlot: deps.modalSlot,
			navigationController: controller,
			networkStatus: deps.networkStatus,
			onNavigateToArtist: deps.onNavigateToArtist,
			paletteQueue: deps.paletteQueue,
			pinnedItemsStore: deps.pinnedItemsStore,
			playbackStore: deps.playbackStore,
			playlist,
			playlistEditService: deps.playlistEditService,
			preferences: deps.preferences,
			toastService: deps.toastService,
			transport: deps.transport,
			viewCache: deps.viewCache,
		},
		{},
		{ animated: deps.preferences.animationsEnabled },
	);
	headerStore.setVisible(true);
}

export function pushGenre(
	controller: NavigationController,
	deps: DetailPushDeps,
	genre: Genre,
): void {
	controller.push(
		GenreView,
		{
			downloadService: deps.downloadService,
			genre,
			lyricsService: deps.lyricsService,
			modalSlot: deps.modalSlot,
			navigationController: controller,
			networkStatus: deps.networkStatus,
			onNavigateToArtist: deps.onNavigateToArtist,
			paletteQueue: deps.paletteQueue,
			pinnedItemsStore: deps.pinnedItemsStore,
			playbackStore: deps.playbackStore,
			preferences: deps.preferences,
			toastService: deps.toastService,
			transport: deps.transport,
			viewCache: deps.viewCache,
		},
		{},
		{ animated: deps.preferences.animationsEnabled },
	);
	headerStore.setVisible(true);
}
