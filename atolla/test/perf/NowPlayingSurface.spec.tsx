import 'jasmine/src/jasmine';
import { BarColorStore } from 'atolla/src/stores/BarColor';
import type { PlaybackStore } from 'atolla/src/stores/Playback';
import { NowPlayingSurface } from 'atolla/src/ui/components/NowPlayingSurface';
import { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';
import { InstrumentedComponentJSX, valdiIt } from 'valdi_test/test/JSXTestUtils';
import { attachRenderStats } from '../util/renderStats';

const album = {
	artistId: 'artist-1',
	artistName: 'The Artist',
	id: 'album-1',
	imageUrl: 'https://example.com/art.jpg',
	name: 'The Album',
	releaseDate: '2024-01-01',
};

const tracks = Array.from({ length: 8 }, (_, index) => ({
	artistName: 'The Artist',
	duration: 200 + index,
	id: `track-${index}`,
	name: `Track ${index}`,
}));

const stubImageCache = {
	get: () => null,
	getOrLoad: () => null,
	prefetch: () => Promise.resolve(),
	subscribe: () => () => {},
};

function mockPlaybackStore(): PlaybackStore {
	return {
		cycleLoopMode: () => {},
		jumpToIndex: () => {},
		next: () => {},
		playPause: () => {},
		previousOrRestart: () => {},
		progressSeconds: 90,
		seekTo: () => {},
		skipForward: () => {},
		stop: () => {},
		subscribe: () => () => {},
	} as unknown as PlaybackStore;
}

function makeViewModel(isPlaying: boolean) {
	return {
		album,
		animationsEnabled: false,
		artistLogoUrl: null,
		barColors: new BarColorStore(),
		collapseSignal: 0,
		gridColumns: 3,
		imageCache: stubImageCache,
		isPlaying,
		language: 'en',
		loopMode: 'off',
		modalSlot: new DetachedSlot(),
		onAlbumTap: () => {},
		onArtistTap: () => {},
		onOpenPlaylist: () => {},
		playbackStore: mockPlaybackStore(),
		toastService: { show: () => {} },
		track: tracks[3],
		trackIndex: 3,
		tracks,
		transport: {},
	};
}

// tapping play/pause hands the surface a new viewModel with only isPlaying changed. the queue is
// derived from tracks/trackIndex, neither of which moved, so both queue lists should bypass
describe('NowPlayingSurface render identity', () => {
	valdiIt('bypasses the queue lists when only isPlaying changes', async () => {
		const instrumented = InstrumentedComponentJSX.create(
			NowPlayingSurface,
			makeViewModel(false),
			undefined,
		);

		const stats = attachRenderStats(instrumented.getComponent());
		instrumented.setViewModel(makeViewModel(true));

		expect(stats.visits('TrackList')).toBe(2);
		expect(stats.renders('TrackList')).toBe(0);
	});
});
