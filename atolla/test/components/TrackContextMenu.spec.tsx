import 'jasmine/src/jasmine';
import { TrackContextMenu } from 'atolla/src/ui/components/TrackContextMenu';
import { elementTypeFind } from 'foundation/test/util/elementTypeFind';
import { IRenderedElementViewClass } from 'valdi_test/test/IRenderedElementViewClass';
import { valdiIt } from 'valdi_test/test/JSXTestUtils';
import { touchEvent } from '../util/testEvents';
import { renderedElements } from './renderedElements';

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
	};

	const dismissMessages: Array<string | undefined> = [];
	const viewModel = {
		animationsEnabled: false,
		onDismiss: (message?: string) => {
			callOrder.push(`dismiss:${message ?? 'none'}`);
			dismissMessages.push(message);
		},
		playbackStore,
		track,
		transport: {
			getArtistLogoUrl: () => Promise.resolve(null),
		},
		...overrides,
	};

	return { callOrder, dismissMessages, viewModel };
}

describe('TrackContextMenu', () => {
	valdiIt('adds track to queue and dismisses with added-to-queue toast message', async (driver) => {
		const { callOrder, dismissMessages, viewModel } = createViewModel();
		const component = driver.renderComponent(TrackContextMenu, viewModel, undefined);

		const views = elementTypeFind(renderedElements(component), IRenderedElementViewClass.View);
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

			const views = elementTypeFind(renderedElements(component), IRenderedElementViewClass.View);
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

		const views = elementTypeFind(renderedElements(component), IRenderedElementViewClass.View);
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

		const views = elementTypeFind(renderedElements(component), IRenderedElementViewClass.View);
		const albumRow = views.find(
			(view) => view.getAttribute('accessibilityLabel') === 'track-row-swipe-region-track-1-0',
		);

		albumRow?.getAttribute('onTap')?.(touchEvent);

		expect(albumTaps).toEqual(['album']);
		expect(dismissMessages).toEqual([undefined]);
	});

	valdiIt('dismisses without toast when backdrop is tapped', async (driver) => {
		const { callOrder, dismissMessages, viewModel } = createViewModel();
		const component = driver.renderComponent(TrackContextMenu, viewModel, undefined);

		const backdrop = renderedElements(component).find(
			(element) => element.getAttribute('accessibilityLabel') === 'track-context-backdrop',
		);

		backdrop?.getAttribute('onTap')?.(touchEvent);

		expect(callOrder).toEqual(['dismiss:none']);
		expect(dismissMessages).toEqual([undefined]);
	});
});
