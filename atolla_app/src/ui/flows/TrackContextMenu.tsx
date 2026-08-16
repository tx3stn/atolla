import type { Playlist } from 'atolla_core/src/models/Playlist';
import type { Track } from 'atolla_core/src/models/Track';
import type { ImageCache } from 'atolla_core/src/services/ImageCache';
import type { Transport } from 'atolla_core/src/transports/Transport';
import { pagedFromArray } from 'atolla_player/src/services/TrackSource';
import type { PlaybackStore } from 'atolla_player/src/stores/Playback';
import type { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';
import type { ToastService } from '../../services/ToastService';
import { CreatePlaylistModal } from '../components/CreatePlaylistModal';
import { TrackContextMenu } from '../components/TrackContextMenu';
import { AddToPlaylistView } from '../views/AddToPlaylistView';
import { closeSlot, openSlot } from './ModalSlotFlow';

export interface OpenTrackContextMenuOptions {
	animationsEnabled: boolean;
	gridColumns: number;
	imageCache: ImageCache;
	onAlbumTap?: () => void;
	onArtistTap?: () => void;
	onDismiss: () => void;
	onPlaylistCreated?: (playlist: Playlist) => void;
	playbackStore: PlaybackStore;
	toastService: ToastService;
	transport: Transport;
}

export function openTrackContextMenu(
	track: Track,
	modalSlot: DetachedSlot | undefined,
	options: OpenTrackContextMenuOptions,
): void {
	const closeModal = (): void => {
		closeSlot(modalSlot);
	};

	const dismiss = (): void => {
		closeSlot(modalSlot);
		options.onDismiss();
	};

	const createPlaylist = async (name: string): Promise<void> => {
		const playlist = await options.transport.createPlaylist(name, track.id);
		closeSlot(modalSlot);
		options.onPlaylistCreated?.(playlist);
	};

	const onAddToPlaylist = (): void => {
		openSlot(modalSlot, () => {
			<AddToPlaylistView
				animationsEnabled={options.animationsEnabled}
				gridColumns={options.gridColumns}
				imageCache={options.imageCache}
				onDismiss={closeModal}
				toastService={options.toastService}
				tracks={pagedFromArray([track])}
				transport={options.transport}
			/>;
		});
	};

	const onCreatePlaylist = (): void => {
		openSlot(modalSlot, () => {
			<CreatePlaylistModal
				animationsEnabled={options.animationsEnabled}
				onCancel={closeModal}
				onCreate={createPlaylist}
			/>;
		});
	};

	openSlot(modalSlot, () => {
		<TrackContextMenu
			animationsEnabled={options.animationsEnabled}
			imageCache={options.imageCache}
			onAddToPlaylist={onAddToPlaylist}
			onAlbumTap={options.onAlbumTap}
			onArtistTap={options.onArtistTap}
			onCreatePlaylist={onCreatePlaylist}
			onDismiss={dismiss}
			playbackStore={options.playbackStore}
			toastService={options.toastService}
			track={track}
			transport={options.transport}
		/>;
	});
}
