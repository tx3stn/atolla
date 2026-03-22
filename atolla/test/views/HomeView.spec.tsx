// @ts-nocheck
import 'jasmine/src/jasmine';
import { PlaybackStore } from 'atolla/src/stores/Playback';
import { HeaderTabs } from 'atolla/src/ui/components/HeaderTabs';
import { HomeView } from 'atolla/src/ui/views/HomeView';
import { createComponent, valdiIt } from 'valdi_test/test/JSXTestUtils';

const stubImageCache = {
	get: () => null,
	getOrLoad: () => null,
	prefetch: () => Promise.resolve(),
	subscribe: () => () => {},
};

describe('HomeView', () => {
	valdiIt('uses active tab from view model', () => {
		const instrumented = createComponent(HomeView, {
			activeTab: HeaderTabs.albums,
			animationsEnabled: true,
			imageCache: stubImageCache,
			playbackStore: new PlaybackStore(),
			resetSignal: 0,
		});
		const component = instrumented.getComponent();

		expect(component.viewModel.activeTab).toBe(HeaderTabs.albums);
	});

	valdiIt('starts with navigation overlay visible', () => {
		const instrumented = createComponent(HomeView, {
			activeTab: HeaderTabs.artists,
			animationsEnabled: true,
			imageCache: stubImageCache,
			playbackStore: new PlaybackStore(),
			resetSignal: 0,
		});
		const component = instrumented.getComponent();

		expect(component.state.navigationOverlayVisible).toBe(true);
	});
});
