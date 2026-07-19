import type { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';
import type { Playlist } from '../../models/Playlist';
import type { Track } from '../../models/Track';
import type { ImageCache } from '../../services/ImageCache';
import type { ToastService } from '../../services/ToastService';
import { pagedFromArray } from '../../services/TrackSource';
import type { PlaybackStore } from '../../stores/Playback';
import type { Transport } from '../../transports/Transport';
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
	onDismiss: (toastMessage?: string) => void;
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

	const dismiss = (toastMessage?: string): void => {
		closeSlot(modalSlot);
		options.onDismiss(toastMessage);
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
			track={track}
			transport={options.transport}
		/>;
	});
}
