// @ts-nocheck
import 'jasmine/src/jasmine';
import { PlaybackStore } from 'atolla/src/stores/Playback';
import { ArtistsView } from 'atolla/src/ui/views/ArtistsView';
import { componentGetElements } from 'foundation/test/util/componentGetElements';
import { elementTypeFind } from 'foundation/test/util/elementTypeFind';
import { IRenderedElementViewClass } from 'valdi_test/test/IRenderedElementViewClass';
import { createComponent, valdiIt } from 'valdi_test/test/JSXTestUtils';

const stubImageCache = {
	get: () => null,
	prefetch: () => Promise.resolve(),
	subscribe: () => () => {},
};

describe('ArtistsView', () => {
	valdiIt('renders artist names from state', () => {
		const artists = [
			{ id: 'artist-1', name: 'Artist One' },
			{ id: 'artist-2', name: 'Artist Two' },
		];
		const transport = {
			getAllArtists: async () => artists,
		};

		const instrumented = createComponent(ArtistsView, {
			imageCache: stubImageCache,
			playbackStore: new PlaybackStore(),
			transport,
		});
		const component = instrumented.getComponent();
		component.setState({ artists });

		expect(component.state.artists.length).toBe(2);
		const labels = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.Label,
		);
		const values = labels.map((label) => label.getAttribute('value'));
		expect(values).toContain('Artist One');
		expect(values).toContain('Artist Two');
	});

	valdiIt('selects artist when card is tapped', () => {
		const artists = [{ id: 'artist-1', name: 'Artist One' }];
		const transport = {
			getAlbumsByArtist: async () => [],
			getAllArtists: async () => artists,
			getArtistTopTracks: async () => [],
		};

		const instrumented = createComponent(ArtistsView, {
			imageCache: stubImageCache,
			playbackStore: new PlaybackStore(),
			transport,
		});
		const component = instrumented.getComponent();
		component.setState({ artists });

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const firstCard = views.find(
			(view) => view.getAttribute('accessibilityLabel') === 'card-artist-1',
		);
		firstCard?.getAttribute('onTap')?.();

		expect(component.state.selectedArtist?.id).toBe('artist-1');
	});
});
