import 'jasmine/src/jasmine';
import type { ToastService } from 'atolla_app/src/services/ToastService';
import { openAddToPlaylist, openCreatePlaylist } from 'atolla_app/src/ui/flows/PlaylistModals';
import { CancelableController } from 'atolla_app/src/utils/CancelableController';
import type { Playlist } from 'atolla_core/src/models/Playlist';
import type { Track } from 'atolla_core/src/models/Track';
import type { Transport } from 'atolla_core/src/transports/Transport';
import { pagedFromArray } from 'atolla_player/src/services/TrackSource';
import { componentGetElements } from 'foundation/test/util/componentGetElements';
import { elementTypeFind } from 'foundation/test/util/elementTypeFind';
import { Component } from 'valdi_core/src/Component';
import { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';
import { DetachedSlotRenderer } from 'valdi_core/src/slot/DetachedSlotRenderer';
import { IRenderedElementViewClass } from 'valdi_test/test/IRenderedElementViewClass';
import { type IComponentTestDriver, valdiIt } from 'valdi_test/test/JSXTestUtils';
import { editTextEvent, touchEvent } from '../util/testEvents';

interface SlotHostViewModel {
	slot: DetachedSlot;
}

// hosts the renderer so modals opened through the flow land in the tree the test reads
class SlotHost extends Component<SlotHostViewModel> {
	onRender() {
		<view>
			<DetachedSlotRenderer detachedSlot={this.viewModel.slot} />
		</view>;
	}
}

function findByLabel(component: unknown, label: string) {
	return elementTypeFind(
		componentGetElements(component as never),
		IRenderedElementViewClass.View,
	).find((view) => view.getAttribute('accessibilityLabel') === label);
}

function findTextFieldByLabel(component: unknown, label: string) {
	return elementTypeFind(
		componentGetElements(component as never),
		IRenderedElementViewClass.TextField,
	).find((field) => field.getAttribute('accessibilityLabel') === label);
}

async function flush(): Promise<void> {
	for (let i = 0; i < 20; i += 1) {
		await Promise.resolve();
	}
}

function mockTrack(id = 'track-1'): Track {
	return { duration: 180, id, name: `Track ${id}` } as Track;
}

function mockTransport(overrides: Record<string, unknown> = {}): Transport {
	return {
		addItemsToPlaylist: () => Promise.resolve(),
		createPlaylist: (name: string) => Promise.resolve({ id: 'playlist-new', name } as Playlist),
		getPlaylists: () => Promise.resolve({ hasMore: false, items: [] }),
		...overrides,
	} as unknown as Transport;
}

function mockToastService(): ToastService {
	return { show: jasmine.createSpy('show') } as unknown as ToastService;
}

function renderHost(driver: IComponentTestDriver): { component: unknown; slot: DetachedSlot } {
	const slot = new DetachedSlot();
	const component = driver.renderComponent(SlotHost, { slot }, undefined);
	return { component, slot };
}

async function typeNameAndCreate(component: unknown, name: string): Promise<void> {
	findTextFieldByLabel(component, 'create-playlist-name-input')?.getAttribute('onChange')?.(
		editTextEvent(name),
	);
	await flush();
	findByLabel(component, 'create-playlist-create-btn')?.getAttribute('onTap')?.(touchEvent);
	await flush();
}

// closing the slot renders synchronously and resumes awaiting test bodies mid-render, so a
// flush count can land before the callback; wait on the callback itself instead
function deferred(): { resolve: () => void; settled: Promise<void> } {
	let resolve = (): void => {};
	const settled = new Promise<void>((r) => {
		resolve = r;
	});
	return { resolve, settled };
}

describe('PlaylistModals', () => {
	describe('openAddToPlaylist()', () => {
		valdiIt('renders the add-to-playlist view into the slot', async (driver) => {
			const { component, slot } = renderHost(driver);

			openAddToPlaylist(slot, {
				animationsEnabled: false,
				gridColumns: 2,
				toastService: mockToastService(),
				tracks: pagedFromArray([mockTrack()]),
				transport: mockTransport(),
			});
			await flush();

			expect(findByLabel(component, 'add-to-playlist-view')).not.toBeUndefined();
		});

		valdiIt('empties the slot when the view is dismissed', async (driver) => {
			const { component, slot } = renderHost(driver);

			openAddToPlaylist(slot, {
				animationsEnabled: false,
				gridColumns: 2,
				toastService: mockToastService(),
				tracks: pagedFromArray([mockTrack()]),
				transport: mockTransport(),
			});
			await flush();
			findByLabel(component, 'add-to-playlist-cancel')?.getAttribute('onTap')?.(touchEvent);
			await flush();

			expect(findByLabel(component, 'add-to-playlist-view')).toBeUndefined();
		});
	});

	describe('openCreatePlaylist()', () => {
		valdiIt(
			'creates the playlist, adds the tracks and reports the new playlist',
			async (driver) => {
				const { component, slot } = renderHost(driver);
				const addItemsToPlaylist = jasmine
					.createSpy('addItemsToPlaylist')
					.and.returnValue(Promise.resolve());
				const createPlaylist = jasmine
					.createSpy('createPlaylist')
					.and.callFake((name: string) =>
						Promise.resolve({ id: 'playlist-new', name } as Playlist),
					);
				const created = deferred();
				const onPlaylistCreated = jasmine
					.createSpy('onPlaylistCreated')
					.and.callFake(() => created.resolve());

				openCreatePlaylist(slot, {
					animationsEnabled: false,
					onPlaylistCreated,
					playlistFlow: new CancelableController(() => false),
					tracks: pagedFromArray([mockTrack('track-9')]),
					transport: mockTransport({ addItemsToPlaylist, createPlaylist }),
				});
				await flush();
				await typeNameAndCreate(component, 'Roadtrip');
				await created.settled;

				expect(createPlaylist).toHaveBeenCalledWith('Roadtrip');
				expect(addItemsToPlaylist).toHaveBeenCalledWith('playlist-new', ['track-9']);
				expect(onPlaylistCreated).toHaveBeenCalledWith({ id: 'playlist-new', name: 'Roadtrip' });
			},
		);

		valdiIt('closes the slot once the playlist is created', async (driver) => {
			const { component, slot } = renderHost(driver);

			openCreatePlaylist(slot, {
				animationsEnabled: false,
				playlistFlow: new CancelableController(() => false),
				tracks: pagedFromArray([mockTrack()]),
				transport: mockTransport(),
			});
			await flush();
			await typeNameAndCreate(component, 'Roadtrip');

			expect(findByLabel(component, 'create-playlist-create-btn')).toBeUndefined();
		});

		valdiIt('reports nothing when the owner is destroyed mid-flight', async (driver) => {
			const { component, slot } = renderHost(driver);
			const onPlaylistCreated = jasmine.createSpy('onPlaylistCreated');

			openCreatePlaylist(slot, {
				animationsEnabled: false,
				onPlaylistCreated,
				playlistFlow: new CancelableController(() => true),
				tracks: pagedFromArray([mockTrack()]),
				transport: mockTransport(),
			});
			await flush();
			await typeNameAndCreate(component, 'Roadtrip');

			expect(onPlaylistCreated).not.toHaveBeenCalled();
		});

		valdiIt('swallows a failed creation and closes the slot', async (driver) => {
			const { component, slot } = renderHost(driver);
			const onPlaylistCreated = jasmine.createSpy('onPlaylistCreated');

			openCreatePlaylist(slot, {
				animationsEnabled: false,
				onPlaylistCreated,
				playlistFlow: new CancelableController(() => false),
				tracks: pagedFromArray([mockTrack()]),
				transport: mockTransport({ createPlaylist: () => Promise.reject(new Error('nope')) }),
			});
			await flush();
			await typeNameAndCreate(component, 'Roadtrip');

			expect(onPlaylistCreated).not.toHaveBeenCalled();
			expect(findByLabel(component, 'create-playlist-create-btn')).toBeUndefined();
		});
	});
});
