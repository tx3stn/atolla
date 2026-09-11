import type { Playlist } from 'atolla_core/src/models/Playlist';
import type { Transport } from 'atolla_core/src/transports/Transport';
import type { TrackSource } from 'atolla_player/src/services/TrackSource';
import type { PlaybackStore } from 'atolla_player/src/stores/Playback';
import type { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';
import type { ToastService } from '../../services/ToastService';
import type { CancelableController } from '../../utils/CancelableController';
import { CardContextMenu, type CardContextMenuCard } from '../modals/CardContextMenu';
import { closeSlot, openSlot } from './ModalSlotFlow';
import { openAddToPlaylist, openCreatePlaylist } from './PlaylistModals';

export interface OpenCardContextMenuOptions {
	animationsEnabled: boolean;
	card: CardContextMenuCard;
	gridColumns: number;
	isPinned: boolean;
	onArtistTap?: () => void;
	onDismiss: () => void;
	onEntityTap?: () => void;
	onPin: () => void;
	onPlaylistCreated?: (playlist: Playlist) => void;
	onUnpin: () => void;
	playbackStore: PlaybackStore;
	playlistFlow: CancelableController;
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

	const onAddToPlaylist = (tracks: TrackSource): void => {
		openAddToPlaylist(modalSlot, {
			animationsEnabled: options.animationsEnabled,
			gridColumns: options.gridColumns,
			toastService: options.toastService,
			tracks,
			transport: options.transport,
		});
	};

	const onCreatePlaylist = (tracks: TrackSource): void => {
		openCreatePlaylist(modalSlot, {
			animationsEnabled: options.animationsEnabled,
			onPlaylistCreated: options.onPlaylistCreated,
			playlistFlow: options.playlistFlow,
			tracks,
			transport: options.transport,
		});
	};

	openSlot(modalSlot, () => {
		<CardContextMenu
			animationsEnabled={options.animationsEnabled}
			card={options.card}
			isPinned={options.isPinned}
			onAddToPlaylist={onAddToPlaylist}
			onArtistTap={options.onArtistTap}
			onCreatePlaylist={onCreatePlaylist}
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
