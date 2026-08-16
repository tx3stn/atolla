import 'jasmine/src/jasmine';
import { headerStore } from 'atolla_app/src/stores/Header';
import {
	type DetailPushDeps,
	pushAlbum,
	pushArtist,
	pushGenre,
	pushPlaylist,
} from 'atolla_app/src/ui/flows/PushDetail';
import type { Album } from 'atolla_core/src/models/Album';
import type { Artist } from 'atolla_core/src/models/Artist';
import type { Genre } from 'atolla_core/src/models/Genre';
import type { Playlist } from 'atolla_core/src/models/Playlist';
import type { NavigationController } from 'valdi_navigation/src/NavigationController';

describe('PushDetail', () => {
	afterEach(() => {
		headerStore.setVisible(true);
	});

	it('reveals the collapsible header on every detail push', () => {
		const controller = { push: jasmine.createSpy('push') } as unknown as NavigationController;
		const deps = { preferences: { animationsEnabled: false } } as unknown as DetailPushDeps;

		headerStore.setVisible(false);
		pushAlbum(controller, deps, {} as unknown as Album);
		expect(headerStore.isVisible()).toBe(true);

		headerStore.setVisible(false);
		pushArtist(controller, deps, {} as unknown as Artist);
		expect(headerStore.isVisible()).toBe(true);

		headerStore.setVisible(false);
		pushPlaylist(controller, deps, {} as unknown as Playlist);
		expect(headerStore.isVisible()).toBe(true);

		headerStore.setVisible(false);
		pushGenre(controller, deps, {} as unknown as Genre);
		expect(headerStore.isVisible()).toBe(true);
	});
});
