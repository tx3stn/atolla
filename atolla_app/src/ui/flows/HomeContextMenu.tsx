import type { Transport } from 'atolla_core/src/transports/Transport';
import type { TrackSource } from 'atolla_player/src/services/TrackSource';
import type { PlaybackStore } from 'atolla_player/src/stores/Playback';
import type { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';
import type { EntityRef } from '../../services/EntityTracks';
import type { ToastService } from '../../services/ToastService';
import { HomeContextMenu } from '../modals/HomeContextMenu';
import { closeSlot, openSlot } from './ModalSlotFlow';

export interface OpenHomeContextMenuOptions {
	animationsEnabled: boolean;
	items: Array<EntityRef>;
	onAddToPlaylist: (tracks: TrackSource) => void;
	onCreatePlaylist: (tracks: TrackSource) => void;
	onDismiss: () => void;
	playbackStore: PlaybackStore;
	title: string;
	toastService: ToastService;
	transport: Transport;
}

export function openHomeContextMenu(
	modalSlot: DetachedSlot | undefined,
	options: OpenHomeContextMenuOptions,
): void {
	const dismiss = (): void => {
		closeSlot(modalSlot);
		options.onDismiss();
	};

	openSlot(modalSlot, () => {
		<HomeContextMenu
			animationsEnabled={options.animationsEnabled}
			items={options.items}
			onAddToPlaylist={options.onAddToPlaylist}
			onCreatePlaylist={options.onCreatePlaylist}
			onDismiss={dismiss}
			playbackStore={options.playbackStore}
			title={options.title}
			toastService={options.toastService}
			transport={options.transport}
		/>;
	});
}
