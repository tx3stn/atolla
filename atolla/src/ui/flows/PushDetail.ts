import type { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';
import type { NavigationController } from 'valdi_navigation/src/NavigationController';
import type { Album } from '../../models/Album';
import type { Artist } from '../../models/Artist';
import type { Genre } from '../../models/Genre';
import type { Playlist } from '../../models/Playlist';
import type { DownloadService } from '../../services/DownloadService';
import type { ImageCache } from '../../services/ImageCache';
import type { PaletteGenerationQueue } from '../../services/PaletteGenerationQueue';
import type { PlaylistEditService } from '../../services/PlaylistEditService';
import type { ToastService } from '../../services/ToastService';
import type { ViewCache } from '../../services/ViewCache';
import { headerStore } from '../../stores/Header';
import type { PlaybackStore } from '../../stores/Playback';
import type { Preferences } from '../../stores/Preferences';
import type { Transport } from '../../transports/Transport';
import { AlbumView } from '../views/AlbumView';
import { ArtistView } from '../views/ArtistView';
import { GenreView } from '../views/GenreView';
import { PlaylistView } from '../views/PlaylistView';

// the services every detail push needs.
// callers assemble this from their own view model so the push blocks live once.
export interface DetailPushDeps {
	downloadService: DownloadService;
	imageCache: ImageCache;
	modalSlot: DetachedSlot;
	onNavigateToArtist?: (artistId: string) => void;
	// onRootDetailControllerReady is how a tab records its first detail for its own
	// unwind (used by library nav).
	onRootDetailControllerReady?: (controller: NavigationController) => void;
	paletteQueue?: PaletteGenerationQueue;
	playbackStore: PlaybackStore;
	playlistEditService?: PlaylistEditService;
	preferences: Preferences;
	toastService: ToastService;
	transport: Transport;
	viewCache: ViewCache;
}

const noop = (): void => {};

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
			imageCache: deps.imageCache,
			modalSlot: deps.modalSlot,
			navigationController: controller,
			onRootDetailControllerReady: deps.onRootDetailControllerReady ?? noop,
			paletteQueue: deps.paletteQueue,
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
			imageCache: deps.imageCache,
			modalSlot: deps.modalSlot,
			navigationController: controller,
			onNavigationControllerReady: deps.onRootDetailControllerReady ?? noop,
			paletteQueue: deps.paletteQueue,
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
			imageCache: deps.imageCache,
			modalSlot: deps.modalSlot,
			navigationController: controller,
			onNavigateToArtist: deps.onNavigateToArtist,
			onRootDetailControllerReady: deps.onRootDetailControllerReady ?? noop,
			paletteQueue: deps.paletteQueue,
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
			imageCache: deps.imageCache,
			modalSlot: deps.modalSlot,
			navigationController: controller,
			onNavigateToArtist: deps.onNavigateToArtist,
			onRootDetailControllerReady: deps.onRootDetailControllerReady ?? noop,
			paletteQueue: deps.paletteQueue,
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
