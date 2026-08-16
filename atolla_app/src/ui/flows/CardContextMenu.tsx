import type { Transport } from 'atolla_core/src/transports/Transport';
import type { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';
import type { ToastService } from '../../services/ToastService';
import type { TrackSource } from '../../services/TrackSource';
import type { PlaybackStore } from '../../stores/Playback';
import { CardContextMenu, type CardContextMenuCard } from '../components/CardContextMenu';
import { closeSlot, openSlot } from './ModalSlotFlow';

export interface OpenCardContextMenuOptions {
	animationsEnabled: boolean;
	card: CardContextMenuCard;
	isPinned: boolean;
	onAddToPlaylist?: (tracks: TrackSource) => void;
	onArtistTap?: () => void;
	onCreatePlaylist?: (tracks: TrackSource) => void;
	onDismiss: () => void;
	onEntityTap?: () => void;
	onPin: () => void;
	onUnpin: () => void;
	playbackStore: PlaybackStore;
	toastService: ToastService;
	transport: Transport;
}

export function openCardContextMenu(
	modalSlot: DetachedSlot | undefined,
	options: OpenCardContextMenuOptions,
): void {
	const dismiss = (): void => {
		closeSlot(modalSlot);
		options.onDismiss();
	};

	openSlot(modalSlot, () => {
		<CardContextMenu
			animationsEnabled={options.animationsEnabled}
			card={options.card}
			isPinned={options.isPinned}
			onAddToPlaylist={options.onAddToPlaylist}
			onArtistTap={options.onArtistTap}
			onCreatePlaylist={options.onCreatePlaylist}
			onDismiss={dismiss}
			onEntityTap={options.onEntityTap}
			onPin={options.onPin}
			onUnpin={options.onUnpin}
			playbackStore={options.playbackStore}
			toastService={options.toastService}
			transport={options.transport}
		/>;
	});
}
