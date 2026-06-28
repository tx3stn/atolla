import { describe, expect, it } from 'bun:test';
import type { Album } from '../models/Album';
import type { Artist } from '../models/Artist';
import type { Playlist } from '../models/Playlist';
import { NavCoordinator } from './NavCoordinator';

function makeAlbum(id: string): Album {
	return { artistId: '', artistName: '', id, name: '' };
}

function makeArtist(id: string): Artist {
	return { id, name: '' };
}

function makePlaylist(id: string): Playlist {
	return { id, name: '' } as Playlist;
}

describe('NavCoordinator', () => {
	it('switches to the library tab before forwarding artist navigation to the handle', () => {
		const coordinator = new NavCoordinator();
		const calls: Array<string> = [];
		coordinator.setShellNavigator(() => calls.push('switch'));
		coordinator.registerLibrary({
			showAlbum: () => {},
			showArtist: (artist) => calls.push(`artist:${artist.id}`),
			showPlaylist: () => {},
		});

		coordinator.openArtist(makeArtist('artist-1'));

		expect(calls).toEqual(['switch', 'artist:artist-1']);
	});

	it('switches to the library tab before forwarding album navigation', () => {
		const coordinator = new NavCoordinator();
		const calls: Array<string> = [];
		coordinator.setShellNavigator(() => calls.push('switch'));
		coordinator.registerLibrary({
			showAlbum: (album) => calls.push(`album:${album.id}`),
			showArtist: () => {},
			showPlaylist: () => {},
		});

		coordinator.openAlbum(makeAlbum('album-1'));

		expect(calls).toEqual(['switch', 'album:album-1']);
	});

	it('switches to the library tab before forwarding playlist navigation', () => {
		const coordinator = new NavCoordinator();
		const calls: Array<string> = [];
		coordinator.setShellNavigator(() => calls.push('switch'));
		coordinator.registerLibrary({
			showAlbum: () => {},
			showArtist: () => {},
			showPlaylist: (playlist) => calls.push(`playlist:${playlist.id}`),
		});

		coordinator.openPlaylist(makePlaylist('playlist-1'));

		expect(calls).toEqual(['switch', 'playlist:playlist-1']);
	});

	it('no-ops when nothing is registered', () => {
		const coordinator = new NavCoordinator();
		expect(() => coordinator.openArtist(makeArtist('a'))).not.toThrow();
		expect(() => coordinator.openAlbum(makeAlbum('x'))).not.toThrow();
		expect(() => coordinator.openPlaylist(makePlaylist('p'))).not.toThrow();
	});

	it('clears the library handle when passed null', () => {
		const coordinator = new NavCoordinator();
		let artistCalls = 0;
		coordinator.registerLibrary({
			showAlbum: () => {},
			showArtist: () => {
				artistCalls += 1;
			},
			showPlaylist: () => {},
		});
		coordinator.registerLibrary(null);

		coordinator.openArtist(makeArtist('a'));

		expect(artistCalls).toBe(0);
	});
});
