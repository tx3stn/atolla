import 'jasmine/src/jasmine';
import Strings from 'atolla/src/Strings';
import { BarColorStore } from 'atolla/src/stores/BarColor';
import type { PlaybackStore } from 'atolla/src/stores/Playback';
import type { LanguageCode } from 'atolla/src/stores/Preferences';
import { ConnectionModes } from 'atolla/src/transports/Model';
import type { Transport } from 'atolla/src/transports/Transport';
import { MixesSection } from 'atolla/src/ui/components/MixesSection';
import { NowPlayingSurface } from 'atolla/src/ui/components/NowPlayingSurface';
import { componentGetElements } from 'foundation/test/util/componentGetElements';
import { elementTypeFind } from 'foundation/test/util/elementTypeFind';
import { overrideLocales } from 'valdi_core/src/LocalizableStrings';
import { Locale } from 'valdi_core/src/localization/Locale';
import { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';
import { IRenderedElementViewClass } from 'valdi_test/test/IRenderedElementViewClass';
import { InstrumentedComponentJSX, valdiIt } from 'valdi_test/test/JSXTestUtils';

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

function labelValues(component: Parameters<typeof componentGetElements>[0]): Array<string> {
	return elementTypeFind(componentGetElements(component), IRenderedElementViewClass.Label)
		.map((label) => label.getAttribute('value'))
		.filter((value): value is string => typeof value === 'string');
}

function mockPlaybackStore(): PlaybackStore {
	return {
		cycleLoopMode: () => {},
		jumpToIndex: () => {},
		next: () => {},
		playPause: () => {},
		playTracks: () => {},
		previousOrRestart: () => {},
		progressSeconds: 90,
		seekTo: () => {},
		setQueueFiller: () => {},
		skipForward: () => {},
		stop: () => {},
		subscribe: () => () => {},
		trackIndex: 0,
		tracks: [],
	} as unknown as PlaybackStore;
}

function nowPlayingViewModel(trackIndex: number) {
	return {
		album,
		animationsEnabled: false,
		artistLogoUrl: null,
		barColors: new BarColorStore(),
		collapseSignal: 0,
		gridColumns: 3,
		imageCache: stubImageCache,
		isPlaying: false,
		language: 'en',
		loopMode: 'off',
		modalSlot: new DetachedSlot(),
		onAlbumTap: () => {},
		onArtistTap: () => {},
		onOpenPlaylist: () => {},
		playbackStore: mockPlaybackStore(),
		toastService: { show: () => {} },
		track: tracks[trackIndex],
		trackIndex,
		tracks,
		transport: {},
	};
}

// the derived-array caches added in the memoization pass are keyed on more than one input. a
// cache that never invalidates renders stale data forever, so pin the non-identity keys here
describe('derived-array cache invalidation', () => {
	valdiIt('MixesSection rebuilds its cards when the language changes', async () => {
		const viewModel = {
			connectionMode: ConnectionModes.online,
			gridColumns: 3,
			language: 'en' as LanguageCode,
			playbackStore: mockPlaybackStore(),
			transport: {} as Transport,
		};
		const instrumented = InstrumentedComponentJSX.create(MixesSection, viewModel, undefined);
		const english = Strings.shuffleLibrary();
		expect(labelValues(instrumented.getComponent())).toContain(english);

		try {
			overrideLocales(Strings, () => [new Locale('fr', undefined)]);
			instrumented.setViewModel({ ...viewModel, language: 'fr' as LanguageCode });

			const french = Strings.shuffleLibrary();
			expect(french).not.toBe(english);
			expect(labelValues(instrumented.getComponent())).toContain(french);
		} finally {
			overrideLocales(Strings, () => [new Locale('en', undefined)]);
		}
	});

	valdiIt('NowPlayingSurface rebuilds the queue when the track index moves', async () => {
		const instrumented = InstrumentedComponentJSX.create(
			NowPlayingSurface,
			nowPlayingViewModel(0),
			undefined,
		);
		const before = labelValues(instrumented.getComponent());
		expect(before).toContain('Track 1');

		instrumented.setViewModel(nowPlayingViewModel(4));

		const after = labelValues(instrumented.getComponent());
		expect(after).toContain('Track 3');
		expect(after).toContain('Track 5');
	});
});
