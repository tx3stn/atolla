import type { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';
import type { Track } from '../../models/Track';
import type { ImageCache } from '../../services/ImageCache';
import type { PlaybackStore } from '../../stores/Playback';
import type { Transport } from '../../transports/Transport';
import { CardContextMenu, type CardContextMenuCard } from '../components/CardContextMenu';
import { openSlot } from './modalSlotFlow';

export interface OpenCardContextMenuOptions {
	animationsEnabled: boolean;
	card: CardContextMenuCard;
	imageCache: ImageCache;
	onAddToPlaylist?: (tracks: Array<Track>) => void;
	onArtistTap?: () => void;
	onCreatePlaylist?: (tracks: Array<Track>) => void;
	onDismiss: (toastMessage?: string) => void;
	onEntityTap?: () => void;
	playbackStore: PlaybackStore;
	transport: Transport;
}

export function openCardContextMenu(
	modalSlot: DetachedSlot | undefined,
	options: OpenCardContextMenuOptions,
): void {
	openSlot(modalSlot, () => {
		<CardContextMenu
			animationsEnabled={options.animationsEnabled}
			card={options.card}
			imageCache={options.imageCache}
			onAddToPlaylist={options.onAddToPlaylist}
			onArtistTap={options.onArtistTap}
			onCreatePlaylist={options.transport.createPlaylist ? options.onCreatePlaylist : undefined}
			onDismiss={options.onDismiss}
			onEntityTap={options.onEntityTap}
			playbackStore={options.playbackStore}
			transport={options.transport}
		/>;
	});
}
