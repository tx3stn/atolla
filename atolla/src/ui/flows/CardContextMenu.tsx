import type { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';
import type { ToastService } from '../../services/ToastService';
import type { TrackSource } from '../../services/TrackSource';
import type { PlaybackStore } from '../../stores/Playback';
import type { Transport } from '../../transports/Transport';
import { CardContextMenu, type CardContextMenuCard } from '../components/CardContextMenu';
import { closeSlot, openSlot } from './ModalSlotFlow';

export interface OpenCardContextMenuOptions {
	animationsEnabled: boolean;
	card: CardContextMenuCard;
	onAddToPlaylist?: (tracks: TrackSource) => void;
	onArtistTap?: () => void;
	onCreatePlaylist?: (tracks: TrackSource) => void;
	onDismiss: (toastMessage?: string) => void;
	onEntityTap?: () => void;
	playbackStore: PlaybackStore;
	toastService: ToastService;
	transport: Transport;
}

export function openCardContextMenu(
	modalSlot: DetachedSlot | undefined,
	options: OpenCardContextMenuOptions,
): void {
	const dismiss = (toastMessage?: string): void => {
		closeSlot(modalSlot);
		options.onDismiss(toastMessage);
	};

	openSlot(modalSlot, () => {
		<CardContextMenu
			animationsEnabled={options.animationsEnabled}
			card={options.card}
			onAddToPlaylist={options.onAddToPlaylist}
			onArtistTap={options.onArtistTap}
			onCreatePlaylist={options.onCreatePlaylist}
			onDismiss={dismiss}
			onEntityTap={options.onEntityTap}
			playbackStore={options.playbackStore}
			toastService={options.toastService}
			transport={options.transport}
		/>;
	});
}
