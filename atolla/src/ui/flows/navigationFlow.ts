import type { Artist } from '../../models/Artist';
import type { Genre } from '../../models/Genre';
import type { Playlist } from '../../models/Playlist';
import type { DownloadService } from '../../services/DownloadService';
import type { ImageCache } from '../../services/ImageCache';
import type { PaletteGenerationQueue } from '../../services/PaletteGenerationQueue';
import type { PlaylistEditService } from '../../services/PlaylistEditService';
import type { PlaybackStore } from '../../stores/Playback';
import type { Transport } from '../../transports/Transport';
import type { NavBarContext } from '../NavBarContext';
import type { LibraryNavContext } from '../views/LibraryView';

export interface PlaylistViewNavigationArgs {
	animationsEnabled: boolean;
	downloadService: DownloadService;
	gridColumns: number;
	imageCache: ImageCache;
	navBarContext?: NavBarContext;
	onHeaderVisibilityChange?: (isVisible: boolean) => void;
	onNavigateToArtist?: (artistId: string) => void;
	onNavigationContext?: (context: LibraryNavContext | null) => void;
	paletteQueue?: PaletteGenerationQueue;
	playbackStore: PlaybackStore;
	playlist: Playlist;
	playlistEditService?: PlaylistEditService;
	transport: Transport;
}

export function buildPlaylistViewNavigationParams(args: PlaylistViewNavigationArgs) {
	return {
		animationsEnabled: args.animationsEnabled,
		downloadService: args.downloadService,
		gridColumns: args.gridColumns,
		imageCache: args.imageCache,
		navBarContext: args.navBarContext,
		onHeaderVisibilityChange: args.onHeaderVisibilityChange,
		onNavigateToArtist: args.onNavigateToArtist,
		onNavigationContext: args.onNavigationContext,
		paletteQueue: args.paletteQueue,
		playbackStore: args.playbackStore,
		playlist: args.playlist,
		playlistEditService: args.playlistEditService,
		transport: args.transport,
	};
}

export interface ArtistViewNavigationArgs {
	animationsEnabled: boolean;
	artist: Artist;
	downloadService: DownloadService;
	gridColumns: number;
	imageCache: ImageCache;
	navBarContext?: NavBarContext;
	onHeaderVisibilityChange?: (isVisible: boolean) => void;
	onNavigationContext?: (context: LibraryNavContext | null) => void;
	paletteQueue?: PaletteGenerationQueue;
	playbackStore: PlaybackStore;
	transport: Transport;
}

export function buildArtistViewNavigationParams(args: ArtistViewNavigationArgs) {
	return {
		animationsEnabled: args.animationsEnabled,
		artist: args.artist,
		downloadService: args.downloadService,
		gridColumns: args.gridColumns,
		imageCache: args.imageCache,
		navBarContext: args.navBarContext,
		onHeaderVisibilityChange: args.onHeaderVisibilityChange,
		onNavigationContext: args.onNavigationContext,
		paletteQueue: args.paletteQueue,
		playbackStore: args.playbackStore,
		transport: args.transport,
	};
}

export interface GenreViewNavigationArgs {
	animationsEnabled: boolean;
	downloadService: DownloadService;
	genre: Genre;
	gridColumns?: number;
	imageCache: ImageCache;
	navBarContext?: NavBarContext;
	onHeaderVisibilityChange?: (isVisible: boolean) => void;
	onNavigateToArtist?: (artistId: string) => void;
	playbackStore: PlaybackStore;
	transport: Transport;
}

export function buildGenreViewNavigationParams(args: GenreViewNavigationArgs) {
	return {
		animationsEnabled: args.animationsEnabled,
		downloadService: args.downloadService,
		genre: args.genre,
		gridColumns: args.gridColumns,
		imageCache: args.imageCache,
		navBarContext: args.navBarContext,
		onHeaderVisibilityChange: args.onHeaderVisibilityChange,
		onNavigateToArtist: args.onNavigateToArtist,
		playbackStore: args.playbackStore,
		transport: args.transport,
	};
}
