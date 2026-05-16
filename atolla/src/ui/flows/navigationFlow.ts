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

export interface BaseViewNavigationArgs {
	animationsEnabled: boolean;
	downloadService: DownloadService;
	gridColumns: number;
	imageCache: ImageCache;
	navBarContext?: NavBarContext;
	onHeaderVisibilityChange?: (isVisible: boolean) => void;
	playbackStore: PlaybackStore;
	transport: Transport;
}

export interface PlaylistViewNavigationArgs extends BaseViewNavigationArgs {
	onNavigateToArtist?: (artistId: string) => void;
	onNavigationContext?: (context: LibraryNavContext | null) => void;
	paletteQueue?: PaletteGenerationQueue;
	playlist: Playlist;
	playlistEditService?: PlaylistEditService;
}

export interface ArtistViewNavigationArgs extends BaseViewNavigationArgs {
	artist: Artist;
	onNavigationContext?: (context: LibraryNavContext | null) => void;
	paletteQueue?: PaletteGenerationQueue;
}

export interface GenreViewNavigationArgs extends BaseViewNavigationArgs {
	genre: Genre;
	onNavigateToArtist?: (artistId: string) => void;
}
