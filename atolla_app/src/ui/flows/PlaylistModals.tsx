import type { Playlist } from 'atolla_core/src/models/Playlist';
import type { Transport } from 'atolla_core/src/transports/Transport';
import type { TrackSource } from 'atolla_player/src/services/TrackSource';
import type { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';
import type { ToastService } from '../../services/ToastService';
import type { CancelableController } from '../../utils/CancelableController';
import { CreatePlaylistModal } from '../modals/CreatePlaylistModal';
import { AddToPlaylistView } from '../views/AddToPlaylistView';
import { createPlaylistAndAddTracks } from './CreatePlaylist';
import { closeSlot, openSlot } from './ModalSlotFlow';

export interface OpenAddToPlaylistOptions {
	animationsEnabled: boolean;
	gridColumns: number;
	toastService: ToastService;
	tracks: TrackSource;
	transport: Transport;
}

export interface OpenCreatePlaylistOptions {
	animationsEnabled: boolean;
	onPlaylistCreated?: (playlist: Playlist) => void;
	playlistFlow: CancelableController;
	tracks: TrackSource;
	transport: Transport;
}

export function openAddToPlaylist(
	modalSlot: DetachedSlot | undefined,
	options: OpenAddToPlaylistOptions,
): void {
	const closeModal = (): void => {
		closeSlot(modalSlot);
	};

	openSlot(modalSlot, () => {
		<AddToPlaylistView
			animationsEnabled={options.animationsEnabled}
			gridColumns={options.gridColumns}
			onDismiss={closeModal}
			toastService={options.toastService}
			tracks={options.tracks}
			transport={options.transport}
		/>;
	});
}

export function openCreatePlaylist(
	modalSlot: DetachedSlot | undefined,
	options: OpenCreatePlaylistOptions,
): void {
	const closeModal = (): void => {
		closeSlot(modalSlot);
	};

	const create = async (name: string): Promise<void> => {
		const { onPlaylistCreated, playlistFlow, tracks, transport } = options;
		try {
			const { alive, value: playlist } = await playlistFlow.run(
				createPlaylistAndAddTracks(
					name,
					(playlistName) => transport.createPlaylist(playlistName),
					(playlistId, trackIds) => transport.addItemsToPlaylist(playlistId, trackIds),
					tracks,
					{ isCancelled: playlistFlow.isDestroyed },
				),
			);
			if (!alive) return;
			closeModal();
			onPlaylistCreated?.(playlist);
		} catch {
			if (playlistFlow.isDestroyed()) return;
			closeModal();
		}
	};

	openSlot(modalSlot, () => {
		<CreatePlaylistModal
			animationsEnabled={options.animationsEnabled}
			onCancel={closeModal}
			onCreate={create}
		/>;
	});
}
