import 'jasmine/src/jasmine';
import { TrackContextMenu } from 'atolla/src/ui/components/TrackContextMenu';
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
	const dismissMessages: Array<string | undefined> = [];
	const viewModel = {
		animationsEnabled: false,
		onDismiss: (message?: string) => {
			callOrder.push(`dismiss:${message ?? 'none'}`);
			dismissMessages.push(message);
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

	return { callOrder, dismissMessages, toasts, viewModel };
}

// drains the microtask queue so the fire-and-forget mix fetch settles
async function flush(): Promise<void> {
	for (let i = 0; i < 5; i++) {
		await Promise.resolve();
	}
}

describe('TrackContextMenu', () => {
	valdiIt('adds track to queue and dismisses with added-to-queue toast message', async (driver) => {
		const { callOrder, dismissMessages, viewModel } = createViewModel();
		const component = driver.renderComponent(TrackContextMenu, viewModel, undefined);

		const views = elementTypeFind(
			component.renderer.getComponentRootElements(component, true),
			IRenderedElementViewClass.View,
		);
		const addToQueueAction = views.find(
			(view) => view.getAttribute('accessibilityLabel') === 'track-context-add-to-queue',
		);

		addToQueueAction?.getAttribute('onTap')?.(touchEvent);

		expect(callOrder).toEqual(['addToQueue:track-1', 'dismiss:added to queue']);
		expect(dismissMessages).toEqual(['added to queue']);
	});

	valdiIt(
		'queues track to play next and dismisses with play-next toast message',
		async (driver) => {
			const { callOrder, dismissMessages, viewModel } = createViewModel();
			const component = driver.renderComponent(TrackContextMenu, viewModel, undefined);

			const views = elementTypeFind(
				component.renderer.getComponentRootElements(component, true),
				IRenderedElementViewClass.View,
			);
			const playNextAction = views.find(
				(view) => view.getAttribute('accessibilityLabel') === 'track-context-play-next',
			);

			playNextAction?.getAttribute('onTap')?.(touchEvent);

			expect(callOrder).toEqual(['playNext:track-1', 'dismiss:playing next']);
			expect(dismissMessages).toEqual(['playing next']);
		},
	);

	valdiIt('opens the artist and dismisses when the artist logo is tapped', async (driver) => {
		const artistTaps: Array<string> = [];
		const { dismissMessages, viewModel } = createViewModel({
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
		expect(dismissMessages).toEqual([undefined]);
	});

	valdiIt('opens the album and dismisses when the album row is tapped', async (driver) => {
		const albumTaps: Array<string> = [];
		const { dismissMessages, viewModel } = createViewModel({
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
		expect(dismissMessages).toEqual([undefined]);
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
		expect(callOrder).toEqual(['dismiss:none', 'playTracks:mix-1,mix-2:0']);
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

		expect(callOrder).toEqual(['dismiss:none']);
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
		const { callOrder, dismissMessages, viewModel } = createViewModel();
		const component = driver.renderComponent(TrackContextMenu, viewModel, undefined);

		const backdrop = component.renderer
			.getComponentRootElements(component, true)
			.find((element) => element.getAttribute('accessibilityLabel') === 'track-context-backdrop');

		backdrop?.getAttribute('onTap')?.(touchEvent);

		expect(callOrder).toEqual(['dismiss:none']);
		expect(dismissMessages).toEqual([undefined]);
	});
});
