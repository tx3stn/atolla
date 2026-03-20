// @ts-nocheck
import 'jasmine/src/jasmine';
import { PlaylistsView } from 'atolla/src/ui/views/PlaylistsView';
import { componentGetElements } from 'foundation/test/util/componentGetElements';
import { elementTypeFind } from 'foundation/test/util/elementTypeFind';
import { IRenderedElementViewClass } from 'valdi_test/test/IRenderedElementViewClass';
import { createComponent, valdiIt } from 'valdi_test/test/JSXTestUtils';

describe('PlaylistsView', () => {
	valdiIt('renders playlist names from state', () => {
		const playlists = [
			{ id: 'playlist-1', name: 'Roadtrip' },
			{ id: 'playlist-2', name: 'Night Run' },
		];
		const transport = {
			getAllPlaylists: async () => playlists,
		};

		const instrumented = createComponent(PlaylistsView, {
			transport,
		});
		const component = instrumented.getComponent();
		component.setState({ playlists });

		expect(component.state.playlists.length).toBe(2);
		const labels = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.Label,
		);
		const values = labels.map((label) => label.getAttribute('value'));
		expect(values).toContain('Roadtrip');
		expect(values).toContain('Night Run');
	});

	valdiIt('selects playlist when card is tapped', () => {
		const playlists = [{ id: 'playlist-1', name: 'Roadtrip' }];
		const transport = {
			getAllPlaylists: async () => playlists,
			getTracksByPlaylist: async () => [],
		};

		const instrumented = createComponent(PlaylistsView, {
			transport,
		});
		const component = instrumented.getComponent();
		component.setState({ playlists });

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const firstCard = views.find(
			(view) => view.getAttribute('accessibilityLabel') === 'card-playlist-1',
		);
		firstCard?.getAttribute('onTap')?.();

		expect(component.state.selectedPlaylist?.id).toBe('playlist-1');
	});
});
