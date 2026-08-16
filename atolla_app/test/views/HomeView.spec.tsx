import 'jasmine/src/jasmine';
import type { Album } from 'atolla_app/src/models/Album';
import { ConnectionModes } from 'atolla_app/src/models/App';
import type { Track } from 'atolla_app/src/models/Track';
import type { ImageCache } from 'atolla_app/src/services/ImageCache';
import type { OnThisDayService } from 'atolla_app/src/services/OnThisDayService';
import type { RecentlyAddedService } from 'atolla_app/src/services/RecentlyAddedService';
import type { ToastService } from 'atolla_app/src/services/ToastService';
import type { PlaybackStore } from 'atolla_app/src/stores/Playback';
import { Preferences } from 'atolla_app/src/stores/Preferences';
import type { Transport } from 'atolla_app/src/transports/Transport';
import { HomeView, type HomeViewModel } from 'atolla_app/src/ui/views/HomeView';
import { componentGetElements } from 'foundation/test/util/componentGetElements';
import { elementTypeFind } from 'foundation/test/util/elementTypeFind';
import { Component } from 'valdi_core/src/Component';
import { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';
import { DetachedSlotRenderer } from 'valdi_core/src/slot/DetachedSlotRenderer';
import { IRenderedElementViewClass } from 'valdi_test/test/IRenderedElementViewClass';
import { InstrumentedComponentJSX, valdiIt } from 'valdi_test/test/JSXTestUtils';
import { touchEvent, touchEventWith } from '../util/testEvents';

// wrapper that renders the home view alongside a DetachedSlotRenderer so the slot-rendered context
// menu appears in the same component tree as the view
class HomeViewWithSlot extends Component<HomeViewModel> {
	private slot = new DetachedSlot();

	onRender() {
		<view>
			<HomeView {...this.viewModel} modalSlot={this.slot} />
			<DetachedSlotRenderer detachedSlot={this.slot} />
		</view>;
	}
}

async function flushAsyncWork(): Promise<void> {
	for (let i = 0; i < 20; i += 1) {
		await Promise.resolve();
	}
}

function makeOnThisDayService() {
	const calls = { ensureLoaded: 0, getAlbumsForDate: 0, refresh: 0 };
	const albums: Array<Album> = [
		{ artistId: 'ar1', artistName: 'Artist', id: 'a1', name: 'Album One' },
	];
	const service = {
		ensureLoaded: async () => {
			calls.ensureLoaded += 1;
		},
		getAlbumsForDate: () => {
			calls.getAlbumsForDate += 1;
			return albums;
		},
		refresh: async () => {
			calls.refresh += 1;
			return { error: undefined };
		},
	} as unknown as OnThisDayService;
	return { calls, service };
}

function makeRecentlyAddedService() {
	const calls = { loadCached: 0, refresh: 0 };
	const albums: Array<Album> = [
		{ artistId: 'ar1', artistName: 'Artist', id: 'r1', name: 'Recent' },
	];
	const service = {
		loadCached: async () => {
			calls.loadCached += 1;
			return [];
		},
		refresh: async () => {
			calls.refresh += 1;
			return albums;
		},
	} as unknown as RecentlyAddedService;
	return { calls, service };
}

function makeBaseDeps() {
	return {
		connectionMode: ConnectionModes.online,
		imageCache: {} as ImageCache,
		onOpenAlbum: () => {},
		playbackStore: { subscribe: () => () => {} } as unknown as PlaybackStore,
		preferences: new Preferences({ fetchString: async () => '', storeString: async () => {} }),
		toastService: { show: () => {}, subscribe: () => () => {} } as unknown as ToastService,
		transport: {} as Transport,
	};
}

function buildViewModel(
	base: ReturnType<typeof makeBaseDeps>,
	onThisDayService: OnThisDayService | undefined,
	recentlyAddedService: RecentlyAddedService | undefined,
	recentlyPlayedTracks: Array<Track> = [],
): HomeViewModel {
	return { ...base, onThisDayService, recentlyAddedService, recentlyPlayedTracks };
}

describe('HomeView', () => {
	it('loads on-this-day and recently-added once the services become available after mount', async () => {
		const base = makeBaseDeps();
		const onThisDay = makeOnThisDayService();
		const recentlyAdded = makeRecentlyAddedService();
		const instrumented = InstrumentedComponentJSX.create(
			HomeView,
			buildViewModel(base, undefined, undefined),
			undefined,
		);

		await flushAsyncWork();
		expect(onThisDay.calls.ensureLoaded).toBe(0);
		expect(recentlyAdded.calls.refresh).toBe(0);

		instrumented.setViewModel(buildViewModel(base, onThisDay.service, recentlyAdded.service));
		await flushAsyncWork();

		expect(onThisDay.calls.ensureLoaded).toBe(1);
		expect(recentlyAdded.calls.loadCached).toBe(1);
		expect(recentlyAdded.calls.refresh).toBe(1);
	});

	it('does not reload when an unrelated view-model update leaves the services unchanged', async () => {
		const base = makeBaseDeps();
		const onThisDay = makeOnThisDayService();
		const recentlyAdded = makeRecentlyAddedService();
		const instrumented = InstrumentedComponentJSX.create(
			HomeView,
			buildViewModel(base, onThisDay.service, recentlyAdded.service),
			undefined,
		);

		await flushAsyncWork();
		expect(onThisDay.calls.ensureLoaded).toBe(1);

		const track = { albumName: 'A', artistName: 'B', id: 't1', name: 'Song' } as unknown as Track;
		instrumented.setViewModel(
			buildViewModel(base, onThisDay.service, recentlyAdded.service, [track]),
		);
		await flushAsyncWork();

		expect(onThisDay.calls.ensureLoaded).toBe(1);
	});

	// the context menu toasts through the service this view hands it, so a queue action taken from
	// home surfaces the same confirmation the library grids do
	valdiIt('surfaces the add-to-queue toast from a recently-added card', async (driver) => {
		const toasts: Array<string> = [];
		const base = makeBaseDeps();
		base.toastService = {
			show: (toast: { message: string; variant: string }) => {
				toasts.push(`${toast.variant}:${toast.message}`);
			},
			subscribe: () => () => {},
		} as unknown as ToastService;
		base.playbackStore = {
			addToQueue: () => {},
			subscribe: () => () => {},
		} as unknown as PlaybackStore;
		base.transport = {
			getArtistLogoUrl: () => Promise.resolve(null),
			getTracksByAlbum: () => Promise.resolve([{ duration: 180, id: 't1', name: 'Track' }]),
		} as unknown as Transport;
		await base.preferences.setAnimationsEnabled(false);

		const recentlyAdded = makeRecentlyAddedService();
		const component = driver.renderComponent(
			HomeViewWithSlot,
			buildViewModel(base, undefined, recentlyAdded.service),
			undefined,
		);
		await flushAsyncWork();

		jasmine.clock().install();
		try {
			const card = elementTypeFind(
				componentGetElements(component),
				IRenderedElementViewClass.View,
			).find((view) => view.getAttribute('accessibilityLabel') === 'card-r1');
			card?.getAttribute('onTouch')?.(touchEventWith({ state: 0 }));
			jasmine.clock().tick(500);
		} finally {
			jasmine.clock().uninstall();
		}

		const addToQueue = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.View,
		).find((view) => view.getAttribute('accessibilityLabel') === 'card-context-add-to-queue');
		addToQueue?.getAttribute('onTap')?.(touchEvent);
		await flushAsyncWork();

		expect(toasts).toEqual(['success:added to queue']);
	});
});
