import 'jasmine/src/jasmine';
import { PlaybackStore } from 'atolla/src/stores/Playback';
import { Preferences } from 'atolla/src/stores/Preferences';
import { SearchView } from 'atolla/src/ui/views/SearchView';
import { InstrumentedComponentJSX, valdiIt } from 'valdi_test/test/JSXTestUtils';
import { attachRenderStats } from '../util/renderStats';

const stubImageCache = {
	get: () => null,
	getOrLoad: () => null,
	prefetch: () => Promise.resolve(),
	subscribe: () => () => {},
};

const searchResults = {
	albums: [{ artistId: 'artist-1', artistName: 'Converge', id: 'album-1', name: 'Jane Doe' }],
	artists: [{ id: 'artist-1', name: 'Converge' }],
	playlists: [{ id: 'playlist-1', name: 'Heavy' }],
	tracks: [{ duration: 123, id: 'track-1', name: 'Concubine' }],
};

function flushAsyncWork(): Promise<void> {
	return Promise.resolve().then(() => Promise.resolve());
}

function makeViewModel() {
	return {
		imageCache: stubImageCache,
		navigationController: { push: () => {} },
		playbackStore: new PlaybackStore(),
		preferences: new Preferences({ fetchString: async () => '', storeString: async () => {} }),
		searchStore: {
			addRecentSearch: () => Promise.resolve([]),
			getRecentSearches: () => Promise.resolve([]),
		},
		transport: { search: () => Promise.resolve(searchResults) },
	};
}

// a keystroke only changes state.query; the rendered results are unchanged, so every result
// child should be bypassed rather than re-rendered. asserting visits first keeps the renders
// assertions honest — a pass that never reached the children would otherwise report zero renders
describe('SearchView render identity', () => {
	valdiIt('does not re-render result children when only the query changes', async () => {
		const component = InstrumentedComponentJSX.create(
			SearchView,
			makeViewModel(),
			undefined,
		).getComponent();

		component.handleSubmitSearch('jane');
		await flushAsyncWork();
		expect(component.state.status).toBe('success');

		const stats = attachRenderStats(component);
		component.setState({ query: 'jane d' });
		await flushAsyncWork();

		expect(stats.visits('CardGrid')).toBe(3);
		expect(stats.visits('TrackList')).toBe(1);
		expect(stats.renders('CardGrid')).toBe(0);
		expect(stats.renders('TrackList')).toBe(0);
	});
});
