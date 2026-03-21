// @ts-nocheck
import 'jasmine/src/jasmine';
import { PlaybackStore } from 'atolla/src/stores/Playback';
import { AlbumsView } from 'atolla/src/ui/views/AlbumsView';
import { componentGetElements } from 'foundation/test/util/componentGetElements';
import { elementTypeFind } from 'foundation/test/util/elementTypeFind';
import { IRenderedElementViewClass } from 'valdi_test/test/IRenderedElementViewClass';
import { createComponent, valdiIt } from 'valdi_test/test/JSXTestUtils';

const stubImageCache = {
	get: () => null,
	prefetch: () => Promise.resolve(),
	subscribe: () => () => {},
};

describe('AlbumsView', () => {
	valdiIt('renders album titles from state', () => {
		const albums = [
			{ artistId: 'artist-1', artistName: 'Artist One', id: 'album-1', name: 'First Album' },
			{ artistId: 'artist-2', artistName: 'Artist Two', id: 'album-2', name: 'Second Album' },
		];
		const transport = {
			getAllAlbums: async () => albums,
		};

		const instrumented = createComponent(AlbumsView, {
			imageCache: stubImageCache,
			playbackStore: new PlaybackStore(),
			transport,
		});
		const component = instrumented.getComponent();
		component.setState({ albums });

		expect(component.state.albums.length).toBe(2);
		const labels = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.Label,
		);
		const values = labels.map((label) => label.getAttribute('value'));
		expect(values).toContain('First Album');
		expect(values).toContain('Second Album');
	});

	valdiIt('selects album when card is tapped', () => {
		const albums = [
			{ artistId: 'artist-1', artistName: 'Artist One', id: 'album-1', name: 'First Album' },
		];
		const transport = {
			getAllAlbums: async () => albums,
			getArtist: async () => null,
			getTracksByAlbum: async () => [],
		};

		const instrumented = createComponent(AlbumsView, {
			imageCache: stubImageCache,
			playbackStore: new PlaybackStore(),
			transport,
		});
		const component = instrumented.getComponent();
		component.setState({ albums });

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const firstCard = views.find(
			(view) => view.getAttribute('accessibilityLabel') === 'card-album-1',
		);
		firstCard?.getAttribute('onTap')?.();

		expect(component.state.selectedAlbum?.id).toBe('album-1');
	});
});
