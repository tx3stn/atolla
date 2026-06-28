import type { Album } from '../models/Album';
import type { Artist } from '../models/Artist';
import type { Playlist } from '../models/Playlist';

export interface LibraryNavHandle {
	showAlbum(album: Album): void;
	showArtist(artist: Artist): void;
	showPlaylist(playlist: Playlist): void;
}

/**
 * Bridges cross-tab navigation: a result selected in the Search tab has to switch the shell to the
 * Library tab and open the detail in Library's own navigation stack. The shell registers how to
 * switch tabs (`setShellNavigator`) and Library registers how to open a detail (`registerLibrary`).
 */
export class NavCoordinator {
	private libraryHandle?: LibraryNavHandle;
	private switchToLibrary?: () => void;

	registerLibrary(handle: LibraryNavHandle | null): void {
		this.libraryHandle = handle ?? undefined;
	}

	setShellNavigator(switchToLibrary: (() => void) | null): void {
		this.switchToLibrary = switchToLibrary ?? undefined;
	}

	openArtist(artist: Artist): void {
		this.switchToLibrary?.();
		this.libraryHandle?.showArtist(artist);
	}

	openAlbum(album: Album): void {
		this.switchToLibrary?.();
		this.libraryHandle?.showAlbum(album);
	}

	openPlaylist(playlist: Playlist): void {
		this.switchToLibrary?.();
		this.libraryHandle?.showPlaylist(playlist);
	}
}
