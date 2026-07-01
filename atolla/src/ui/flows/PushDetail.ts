import type { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';
import type { NavigationController } from 'valdi_navigation/src/NavigationController';
import type { Album } from '../../models/Album';
import type { Artist } from '../../models/Artist';
import type { Playlist } from '../../models/Playlist';
import type { DownloadService } from '../../services/DownloadService';
import type { ImageCache } from '../../services/ImageCache';
import type { PaletteGenerationQueue } from '../../services/PaletteGenerationQueue';
import type { PlaylistEditService } from '../../services/PlaylistEditService';
import type { ToastService } from '../../services/ToastService';
import type { PlaybackStore } from '../../stores/Playback';
import type { Transport } from '../../transports/Transport';
import { AlbumView } from '../views/AlbumView';
import { ArtistView } from '../views/ArtistView';
import { PlaylistView } from '../views/PlaylistView';

// The services every detail push needs. Callers assemble this from their own view model so the push
// blocks live once. `onRootDetailControllerReady` is how a tab records its first detail for its own
// unwind (Library uses it); tabs that don't need it can omit it.
export interface DetailPushDeps {
	animationsEnabled: boolean;
	downloadService: DownloadService;
	gridColumns: number;
	imageCache: ImageCache;
	modalSlot: DetachedSlot;
	onNavigateToArtist?: (artistId: string) => void;
	onRootDetailControllerReady?: (controller: NavigationController) => void;
	paletteQueue?: PaletteGenerationQueue;
	playbackStore: PlaybackStore;
	playlistEditService?: PlaylistEditService;
	toastService: ToastService;
	transport: Transport;
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
			animationsEnabled: deps.animationsEnabled,
			downloadService: deps.downloadService,
			gridColumns: deps.gridColumns,
			imageCache: deps.imageCache,
			modalSlot: deps.modalSlot,
			navigationController: controller,
			onRootDetailControllerReady: deps.onRootDetailControllerReady ?? noop,
			paletteQueue: deps.paletteQueue,
			playbackStore: deps.playbackStore,
			toastService: deps.toastService,
			transport: deps.transport,
		},
		{},
		{ animated: deps.animationsEnabled },
	);
}

export function pushArtist(
	controller: NavigationController,
	deps: DetailPushDeps,
	artist: Artist,
): void {
	controller.push(
		ArtistView,
		{
			animationsEnabled: deps.animationsEnabled,
			artist,
			downloadService: deps.downloadService,
			gridColumns: deps.gridColumns,
			imageCache: deps.imageCache,
			modalSlot: deps.modalSlot,
			navigationController: controller,
			onNavigationControllerReady: deps.onRootDetailControllerReady ?? noop,
			paletteQueue: deps.paletteQueue,
			playbackStore: deps.playbackStore,
			toastService: deps.toastService,
			transport: deps.transport,
		},
		{},
		{ animated: deps.animationsEnabled },
	);
}

export function pushPlaylist(
	controller: NavigationController,
	deps: DetailPushDeps,
	playlist: Playlist,
): void {
	controller.push(
		PlaylistView,
		{
			animationsEnabled: deps.animationsEnabled,
			downloadService: deps.downloadService,
			gridColumns: deps.gridColumns,
			imageCache: deps.imageCache,
			modalSlot: deps.modalSlot,
			navigationController: controller,
			onNavigateToArtist: deps.onNavigateToArtist,
			onRootDetailControllerReady: deps.onRootDetailControllerReady ?? noop,
			paletteQueue: deps.paletteQueue,
			playbackStore: deps.playbackStore,
			playlist,
			playlistEditService: deps.playlistEditService,
			toastService: deps.toastService,
			transport: deps.transport,
		},
		{},
		{ animated: deps.animationsEnabled },
	);
}
