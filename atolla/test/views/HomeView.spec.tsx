// @ts-nocheck
import 'jasmine/src/jasmine';
import { PlaybackStore } from 'atolla/src/stores/Playback';
import { HeaderTabs } from 'atolla/src/ui/components/HeaderTabs';
import { HomeView } from 'atolla/src/ui/views/HomeView';
import { createComponent, valdiIt } from 'valdi_test/test/JSXTestUtils';

describe('HomeView', () => {
	valdiIt('starts on ARTISTS tab', () => {
		const instrumented = createComponent(HomeView, {
			playbackStore: new PlaybackStore(),
		});
		const component = instrumented.getComponent();

		expect(component.state.activeTab).toBe(HeaderTabs.artists);
	});

	valdiIt('switches active tab when a different tab is tapped', () => {
		const instrumented = createComponent(HomeView, {
			playbackStore: new PlaybackStore(),
		});
		const component = instrumented.getComponent();

		component.handleHeaderTabTap(HeaderTabs.albums);

		expect(component.state.activeTab).toBe(HeaderTabs.albums);
	});

	valdiIt('increments tab key when tapping the active tab', () => {
		const instrumented = createComponent(HomeView, {
			playbackStore: new PlaybackStore(),
		});
		const component = instrumented.getComponent();
		const before = component.state.tabKeys[HeaderTabs.artists];

		component.handleHeaderTabTap(HeaderTabs.artists);

		expect(component.state.tabKeys[HeaderTabs.artists]).toBe(before + 1);
		expect(component.state.activeTab).toBe(HeaderTabs.artists);
	});
});
