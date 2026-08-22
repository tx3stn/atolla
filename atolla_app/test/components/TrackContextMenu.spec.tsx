import 'jasmine/src/jasmine';
import { TrackContextMenu } from 'atolla_app/src/ui/components/TrackContextMenu';
import { elementTypeFind } from 'foundation/test/util/elementTypeFind';
import { IRenderedElementViewClass } from 'valdi_test/test/IRenderedElementViewClass';
import { valdiIt } from 'valdi_test/test/JSXTestUtils';
import { touchEvent } from '../util/testEvents';

const track = {
	albumImageUrl: 'https://example.com/album.jpg',
	albumName: 'The Album',
	artistId: 'artist-1',
	artistName: 'The Artist',
	duration: 180,
	id: 'track-1',
	name: 'The Track',
};

function createViewModel(overrides = {}) {
	const callOrder: Array<string> = [];
	const playbackStore = {
		addToQueue: (tracks: Array<typeof track>) => {
			callOrder.push(`addToQueue:${tracks[0]?.id ?? 'unknown'}`);
		},
		playNext: (tracks: Array<typeof track>) => {
			callOrder.push(`playNext:${tracks[0]?.id ?? 'unknown'}`);
		},
		playTracks: (tracks: Array<typeof track>, startIndex: number) => {
			callOrder.push(`playTracks:${tracks.map((t) => t.id).join(',')}:${startIndex}`);
		},
	};

	const toasts: Array<string> = [];
	const viewModel = {
		animationsEnabled: false,
		onDismiss: () => {
			callOrder.push('dismiss');
		},
		onLyrics: () => {
			callOrder.push('lyrics');
		},
		playbackStore,
		toastService: {
			show: (toast: { message: string; variant: string }) => {
				toasts.push(`${toast.variant}:${toast.message}`);
			},
		},
		track,
		transport: {
			getArtistLogoUrl: () => Promise.resolve(null),
		},
		...overrides,
	};

	return { callOrder, toasts, viewModel };
}

// drains the microtask queue so the fire-and-forget mix fetch settles
async function flush(): Promise<void> {
	for (let i = 0; i < 5; i++) {
		await Promise.resolve();
	}
}

describe('TrackContextMenu', () => {
	valdiIt('adds track to queue, toasts and dismisses', async (driver) => {
		const { callOrder, toasts, viewModel } = createViewModel();
		const component = driver.renderComponent(TrackContextMenu, viewModel, undefined);

		const views = elementTypeFind(
			component.renderer.getComponentRootElements(component, true),
			IRenderedElementViewClass.View,
		);
		const addToQueueAction = views.find(
			(view) => view.getAttribute('accessibilityLabel') === 'track-context-add-to-queue',
		);

		addToQueueAction?.getAttribute('onTap')?.(touchEvent);

		expect(callOrder).toEqual(['addToQueue:track-1', 'dismiss']);
		expect(toasts).toEqual(['success:added to queue']);
	});

	valdiIt('queues track to play next, toasts and dismisses', async (driver) => {
		const { callOrder, toasts, viewModel } = createViewModel();
		const component = driver.renderComponent(TrackContextMenu, viewModel, undefined);

		const views = elementTypeFind(
			component.renderer.getComponentRootElements(component, true),
			IRenderedElementViewClass.View,
		);
		const playNextAction = views.find(
			(view) => view.getAttribute('accessibilityLabel') === 'track-context-play-next',
		);

		playNextAction?.getAttribute('onTap')?.(touchEvent);

		expect(callOrder).toEqual(['playNext:track-1', 'dismiss']);
		expect(toasts).toEqual(['success:playing next']);
	});

	valdiIt('opens the artist and dismisses when the artist logo is tapped', async (driver) => {
		const artistTaps: Array<string> = [];
		const { callOrder, toasts, viewModel } = createViewModel({
			onArtistTap: () => {
				artistTaps.push('artist');
			},
		});
		const component = driver.renderComponent(TrackContextMenu, viewModel, undefined);

		const views = elementTypeFind(
			component.renderer.getComponentRootElements(component, true),
			IRenderedElementViewClass.View,
		);
		const artistLogo = views.find(
			(view) => view.getAttribute('accessibilityLabel') === 'track-context-artist-logo',
		);

		artistLogo?.getAttribute('onTap')?.(touchEvent);

		expect(artistTaps).toEqual(['artist']);
		expect(callOrder).toEqual(['dismiss']);
		expect(toasts).toEqual([]);
	});

	valdiIt('opens the album and dismisses when the album row is tapped', async (driver) => {
		const albumTaps: Array<string> = [];
		const { callOrder, toasts, viewModel } = createViewModel({
			onAlbumTap: () => {
				albumTaps.push('album');
			},
		});
		const component = driver.renderComponent(TrackContextMenu, viewModel, undefined);

		const views = elementTypeFind(
			component.renderer.getComponentRootElements(component, true),
			IRenderedElementViewClass.View,
		);
		const albumRow = views.find(
			(view) => view.getAttribute('accessibilityLabel') === 'track-row-swipe-region-track-1-0',
		);

		albumRow?.getAttribute('onTap')?.(touchEvent);

		expect(albumTaps).toEqual(['album']);
		expect(callOrder).toEqual(['dismiss']);
		expect(toasts).toEqual([]);
	});

	valdiIt('plays an instant mix seeded from the track and dismisses', async (driver) => {
		const mix = [
			{ ...track, id: 'mix-1' },
			{ ...track, id: 'mix-2' },
		];
		const seeds: Array<unknown> = [];
		const { callOrder, toasts, viewModel } = createViewModel({
			transport: {
				getArtistLogoUrl: () => Promise.resolve(null),
				getInstantMix: (seed: unknown) => {
					seeds.push(seed);
					return Promise.resolve(mix);
				},
			},
		});
		const component = driver.renderComponent(TrackContextMenu, viewModel, undefined);

		const views = elementTypeFind(
			component.renderer.getComponentRootElements(component, true),
			IRenderedElementViewClass.View,
		);
		const instantMixAction = views.find(
			(view) => view.getAttribute('accessibilityLabel') === 'track-context-instant-mix',
		);

		instantMixAction?.getAttribute('onTap')?.(touchEvent);
		await flush();

		expect(seeds).toEqual([{ id: 'track-1', kind: 'track' }]);
		expect(callOrder).toEqual(['dismiss', 'playTracks:mix-1,mix-2:0']);
		expect(toasts).toEqual([]);
	});

	valdiIt('toasts an error when the instant mix comes back empty', async (driver) => {
		const { callOrder, toasts, viewModel } = createViewModel({
			transport: {
				getArtistLogoUrl: () => Promise.resolve(null),
				getInstantMix: () => Promise.resolve([]),
			},
		});
		const component = driver.renderComponent(TrackContextMenu, viewModel, undefined);

		const views = elementTypeFind(
			component.renderer.getComponentRootElements(component, true),
			IRenderedElementViewClass.View,
		);
		const instantMixAction = views.find(
			(view) => view.getAttribute('accessibilityLabel') === 'track-context-instant-mix',
		);

		instantMixAction?.getAttribute('onTap')?.(touchEvent);
		await flush();

		expect(callOrder).toEqual(['dismiss']);
		expect(toasts).toEqual(['error:instant mix failed']);
	});

	valdiIt('toasts an error when the instant mix fetch rejects', async (driver) => {
		const { toasts, viewModel } = createViewModel({
			transport: {
				getArtistLogoUrl: () => Promise.resolve(null),
				getInstantMix: () => Promise.reject(new Error('boom')),
			},
		});
		const component = driver.renderComponent(TrackContextMenu, viewModel, undefined);

		const views = elementTypeFind(
			component.renderer.getComponentRootElements(component, true),
			IRenderedElementViewClass.View,
		);
		const instantMixAction = views.find(
			(view) => view.getAttribute('accessibilityLabel') === 'track-context-instant-mix',
		);

		instantMixAction?.getAttribute('onTap')?.(touchEvent);
		await flush();

		expect(toasts).toEqual(['error:instant mix failed']);
	});

	valdiIt('dismisses without toast when backdrop is tapped', async (driver) => {
		const { callOrder, toasts, viewModel } = createViewModel();
		const component = driver.renderComponent(TrackContextMenu, viewModel, undefined);

		const backdrop = component.renderer
			.getComponentRootElements(component, true)
			.find((element) => element.getAttribute('accessibilityLabel') === 'track-context-backdrop');

		backdrop?.getAttribute('onTap')?.(touchEvent);

		expect(callOrder).toEqual(['dismiss']);
		expect(toasts).toEqual([]);
	});

	valdiIt('opens lyrics from the lyrics row', async (driver) => {
		const { callOrder, viewModel } = createViewModel();
		const component = driver.renderComponent(TrackContextMenu, viewModel, undefined);

		elementTypeFind(
			component.renderer.getComponentRootElements(component, true),
			IRenderedElementViewClass.View,
		)
			.find((view) => view.getAttribute('accessibilityLabel') === 'track-context-lyrics')
			?.getAttribute('onTap')?.(touchEvent);

		expect(callOrder).toEqual(['lyrics']);
	});

	valdiIt(
		'leaves the lyrics row inert for a track the server has no lyrics for',
		async (driver) => {
			const { callOrder, viewModel } = createViewModel({
				track: { ...track, hasLyrics: false },
			});
			const component = driver.renderComponent(TrackContextMenu, viewModel, undefined);

			const lyricsRow = elementTypeFind(
				component.renderer.getComponentRootElements(component, true),
				IRenderedElementViewClass.View,
			).find((view) => view.getAttribute('accessibilityLabel') === 'track-context-lyrics');

			expect(lyricsRow).toBeDefined();
			expect(lyricsRow?.getAttribute('onTap')).toBeUndefined();
			expect(callOrder).toEqual([]);
		},
	);

	valdiIt('keeps the lyrics row tappable when availability is unknown', async (driver) => {
		const { callOrder, viewModel } = createViewModel({
			track: { ...track, hasLyrics: undefined },
		});
		const component = driver.renderComponent(TrackContextMenu, viewModel, undefined);

		elementTypeFind(
			component.renderer.getComponentRootElements(component, true),
			IRenderedElementViewClass.View,
		)
			.find((view) => view.getAttribute('accessibilityLabel') === 'track-context-lyrics')
			?.getAttribute('onTap')?.(touchEvent);

		expect(callOrder).toEqual(['lyrics']);
	});
});
