import 'jasmine/src/jasmine';
import { type AppServicesBag, appServices } from 'atolla/src/services/AppServices';
import { appShellStore } from 'atolla/src/stores/AppShell';
import { BarColorStore } from 'atolla/src/stores/BarColor';
import type { PlaybackStore } from 'atolla/src/stores/Playback';
import { OverlayHost } from 'atolla/src/ui/views/OverlayHost';
import { componentGetElements } from 'foundation/test/util/componentGetElements';
import { elementTypeFind } from 'foundation/test/util/elementTypeFind';
import { Component } from 'valdi_core/src/Component';
import { Device } from 'valdi_core/src/Device';
import { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';
import { IRenderedElementViewClass } from 'valdi_test/test/IRenderedElementViewClass';
import { InstrumentedComponentJSX } from 'valdi_test/test/JSXTestUtils';

const album = {
	artistId: 'artist-1',
	artistName: 'The Artist',
	id: 'album-1',
	imageUrl: 'https://example.com/art.jpg',
	name: 'The Album',
	releaseDate: '2024-01-01',
};

const track = { artistName: 'The Artist', duration: 240, id: 'track-1', name: 'The Track' };

function playbackStore(overrides: Record<string, unknown> = {}): PlaybackStore {
	return {
		album: null,
		artistLogoUrl: null,
		isPlaying: false,
		progressSeconds: 0,
		subscribe: () => () => {},
		track: null,
		trackIndex: 0,
		tracks: [],
		...overrides,
	} as unknown as PlaybackStore;
}

function setServices(store: PlaybackStore): void {
	const stub = {} as unknown;
	appServices.set({
		barColors: new BarColorStore(),
		connectionMode: 'online',
		downloadingCount: 0,
		downloadService: stub as AppServicesBag['downloadService'],
		imageCache: stub as AppServicesBag['imageCache'],
		modalSlot: new DetachedSlot(),
		onRequestModeChange: async () => true,
		paletteQueue: stub as AppServicesBag['paletteQueue'],
		paletteService: {
			getPalette: () => undefined,
			subscribe: () => () => {},
		} as unknown as AppServicesBag['paletteService'],
		playbackOrchestrator: {
			getWaveformMaskUrl: () => undefined,
			subscribeOverlayContent: () => () => {},
		} as unknown as AppServicesBag['playbackOrchestrator'],
		playbackStore: store,
		preferences: {
			animationsEnabled: false,
			gridColumns: 3,
			language: 'en',
			subscribe: () => () => {},
		} as unknown as AppServicesBag['preferences'],
		toastService: stub as AppServicesBag['toastService'],
		toastSlot: new DetachedSlot(),
		transport: stub as AppServicesBag['transport'],
	});
}

function labelValues(component: Parameters<typeof componentGetElements>[0]): Array<string> {
	const labels = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.Label);
	return labels
		.map((label) => label.getAttribute('value'))
		.filter((value): value is string => typeof value === 'string');
}

// OverlayHost's Floating pass-through renders several siblings; a wrapping view gives the mounted root a
// single element, matching how AuthedApp hosts it in-tree.
class OverlayHostHarness extends Component {
	onRender(): void {
		<view>
			<OverlayHost />
		</view>;
	}
}

describe('OverlayHost', () => {
	let instrumented: ReturnType<typeof InstrumentedComponentJSX.create> | undefined;

	// Force Floating's bare pass-through slot so its children are traversable in the test tree; on iOS
	// Floating hosts them in a native AtollaFloatingView the test renderer cannot descend into.
	beforeEach(() => {
		spyOn(Device, 'isAndroid').and.returnValue(true);
	});

	// Destroy the mount so OverlayHost unsubscribes from appServices; otherwise a leaked subscriber
	// re-renders on another suite's appServices.set and crashes on its leaner stub bag.
	afterEach(() => {
		instrumented?.destroy();
		instrumented = undefined;
		appServices.clear();
		appShellStore.reset();
	});

	it('renders nothing until services are ready', () => {
		appServices.clear();
		instrumented = InstrumentedComponentJSX.create(OverlayHostHarness, {}, undefined);
		expect(labelValues(instrumented.getComponent())).not.toContain('The Track');
	});

	it('renders the now-playing track from the shared stores', () => {
		setServices(playbackStore({ album, track, trackIndex: 0, tracks: [track] }));
		instrumented = InstrumentedComponentJSX.create(OverlayHostHarness, {}, undefined);
		expect(labelValues(instrumented.getComponent())).toContain('The Track');
	});

	it('omits the now-playing surface when nothing is playing', () => {
		setServices(playbackStore());
		instrumented = InstrumentedComponentJSX.create(OverlayHostHarness, {}, undefined);
		expect(labelValues(instrumented.getComponent())).not.toContain('The Track');
	});
});
