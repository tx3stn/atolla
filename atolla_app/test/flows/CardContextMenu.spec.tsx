import 'jasmine/src/jasmine';
import { openCardContextMenu } from 'atolla_app/src/ui/flows/CardContextMenu';
import { CancelableController } from 'atolla_app/src/utils/CancelableController';
import type { Album } from 'atolla_core/src/models/Album';
import type { Playlist } from 'atolla_core/src/models/Playlist';
import type { Track } from 'atolla_core/src/models/Track';
import type { Transport } from 'atolla_core/src/transports/Transport';
import type { PlaybackStore } from 'atolla_player/src/stores/Playback';
import { componentGetElements } from 'foundation/test/util/componentGetElements';
import { elementTypeFind } from 'foundation/test/util/elementTypeFind';
import { Component } from 'valdi_core/src/Component';
import { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';
import { DetachedSlotRenderer } from 'valdi_core/src/slot/DetachedSlotRenderer';
import { IRenderedElementViewClass } from 'valdi_test/test/IRenderedElementViewClass';
import { type IComponentTestDriver, valdiIt } from 'valdi_test/test/JSXTestUtils';
import { touchEvent } from '../util/testEvents';

interface SlotHostViewModel {
	slot: DetachedSlot;
}

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

async function waitForLabel(component: unknown, label: string): Promise<void> {
	for (let i = 0; i < 50 && !findByLabel(component, label); i += 1) {
		await Promise.resolve();
	}
}

function mockAlbum(): Album {
	return {
		artistId: 'artist-1',
		artistName: 'Artist One',
		id: 'album-1',
		name: 'Album One',
	} as Album;
}

function mockTransport(): Transport {
	return {
		addItemsToPlaylist: () => Promise.resolve(),
		createPlaylist: (name: string) => Promise.resolve({ id: 'playlist-new', name } as Playlist),
		getArtistLogoUrl: () => Promise.resolve(null),
		getPlaylists: () => Promise.resolve({ hasMore: false, items: [] }),
		getTracksByAlbum: () =>
			Promise.resolve([{ duration: 1, id: 'track-1', name: 'Track One' } as Track]),
		peekArtistLogoUrl: () => undefined,
	} as unknown as Transport;
}

function openMenu(slot: DetachedSlot): void {
	openCardContextMenu(slot, {
		animationsEnabled: false,
		card: { album: mockAlbum(), kind: 'album' },
		gridColumns: 2,
		isPinned: false,
		onDismiss: () => {},
		onPin: () => {},
		onUnpin: () => {},
		playbackStore: {} as unknown as PlaybackStore,
		playlistFlow: new CancelableController(() => false),
		toastService: { show: () => {} } as never,
		transport: mockTransport(),
	});
}

function renderHost(driver: IComponentTestDriver): { component: unknown; slot: DetachedSlot } {
	const slot = new DetachedSlot();
	const component = driver.renderComponent(SlotHost, { slot }, undefined);
	return { component, slot };
}

describe('openCardContextMenu', () => {
	valdiIt('composes the add-to-playlist follow-up itself', async (driver) => {
		const { component, slot } = renderHost(driver);

		openMenu(slot);
		await waitForLabel(component, 'card-context-add-to-playlist');
		findByLabel(component, 'card-context-add-to-playlist')?.getAttribute('onTap')?.(touchEvent);
		await waitForLabel(component, 'add-to-playlist-view');

		expect(findByLabel(component, 'add-to-playlist-view')).not.toBeUndefined();
	});

	valdiIt('composes the create-playlist follow-up itself', async (driver) => {
		const { component, slot } = renderHost(driver);

		openMenu(slot);
		await waitForLabel(component, 'card-context-create-playlist');
		findByLabel(component, 'card-context-create-playlist')?.getAttribute('onTap')?.(touchEvent);
		await waitForLabel(component, 'create-playlist-create-btn');

		expect(findByLabel(component, 'create-playlist-create-btn')).not.toBeUndefined();
	});
});
