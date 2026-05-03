// @ts-nocheck
import 'jasmine/src/jasmine';
import { TrackContextMenu } from 'atolla/src/ui/components/TrackContextMenu';
import { componentGetElements } from 'foundation/test/util/componentGetElements';
import { elementTypeFind } from 'foundation/test/util/elementTypeFind';
import { IRenderedElementViewClass } from 'valdi_test/test/IRenderedElementViewClass';
import { createComponent, valdiIt } from 'valdi_test/test/JSXTestUtils';

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
	valdiIt('adds track to queue and dismisses with added-to-queue toast message', () => {
		const { callOrder, dismissMessages, viewModel } = createViewModel();
		const instrumented = createComponent(TrackContextMenu, viewModel);
		const component = instrumented.getComponent();

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const addToQueueAction = views.find(
			(view) => view.getAttribute('accessibilityLabel') === 'track-context-add-to-queue',
		);

		addToQueueAction?.getAttribute('onTap')?.();

		expect(callOrder).toEqual(['addToQueue:track-1', 'dismiss:added to queue']);
		expect(dismissMessages).toEqual(['added to queue']);
	});

	valdiIt('queues track to play next and dismisses with play-next toast message', () => {
		const { callOrder, dismissMessages, viewModel } = createViewModel();
		const instrumented = createComponent(TrackContextMenu, viewModel);
		const component = instrumented.getComponent();

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const playNextAction = views.find(
			(view) => view.getAttribute('accessibilityLabel') === 'track-context-play-next',
		);

		playNextAction?.getAttribute('onTap')?.();

		expect(callOrder).toEqual(['playNext:track-1', 'dismiss:playing next']);
		expect(dismissMessages).toEqual(['playing next']);
	});

	valdiIt('dismisses without toast when backdrop is tapped', () => {
		const { callOrder, dismissMessages, viewModel } = createViewModel();
		const instrumented = createComponent(TrackContextMenu, viewModel);
		const component = instrumented.getComponent();

		const backdrop = componentGetElements(component).find(
			(element) => element.getAttribute('accessibilityLabel') === 'track-context-backdrop',
		);

		backdrop?.getAttribute('onTap')?.();

		expect(callOrder).toEqual(['dismiss:none']);
		expect(dismissMessages).toEqual([undefined]);
	});
});
