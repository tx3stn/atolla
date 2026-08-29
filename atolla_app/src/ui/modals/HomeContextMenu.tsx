import res from 'atolla_app/res';
import Strings from 'atolla_app/src/Strings';
import type { Track } from 'atolla_core/src/models/Track';
import type { Transport } from 'atolla_core/src/transports/Transport';
import { TRACK_PAGE_SIZE } from 'atolla_core/src/utils/Pagination';
import { startPagedPlayback } from 'atolla_player/src/services/PagedPlayback';
import { chainSources, type TrackSource } from 'atolla_player/src/services/TrackSource';
import { type PlaybackStore, shuffleArray } from 'atolla_player/src/stores/Playback';
import { Component } from 'valdi_core/src/Component';
import {
	type EntityRef,
	type EntityTrackOptions,
	entityTrackSource,
} from '../../services/EntityTracks';
import { type ToastService, ToastTypes } from '../../services/ToastService';
import { ContextMenuActionRow } from './ContextMenuActionRow';
import { ModalBase, modalStyles } from './ModalBase';

export interface HomeContextMenuViewModel {
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

export class HomeContextMenu extends Component<HomeContextMenuViewModel> {
	handleAddToPlaylist = (): void => {
		const tracks = chainSources(this.sources());
		this.viewModel.onDismiss();
		this.viewModel.onAddToPlaylist(tracks);
	};

	handleAddToQueue = (): void => {
		this.collectFirstPages().then((tracks) => {
			if (tracks.length > 0) {
				this.viewModel.playbackStore.addToQueue(tracks);
			}
		});
		this.viewModel.toastService.show({
			message: Strings.addedToQueueToast(),
			variant: ToastTypes.success,
		});
		this.viewModel.onDismiss();
	};

	handleBackdropTap = (): void => {
		this.viewModel.onDismiss();
	};

	handleCreatePlaylist = (): void => {
		const tracks = chainSources(this.sources());
		this.viewModel.onDismiss();
		this.viewModel.onCreatePlaylist(tracks);
	};

	handlePlay = (): void => {
		startPagedPlayback(this.viewModel.playbackStore, chainSources(this.sources()), TRACK_PAGE_SIZE);
		this.viewModel.onDismiss();
	};

	handlePlayNext = (): void => {
		this.collectFirstPages().then((tracks) => {
			if (tracks.length > 0) {
				this.viewModel.playbackStore.playNext(tracks);
			}
		});
		this.viewModel.toastService.show({
			message: Strings.playingNextToast(),
			variant: ToastTypes.success,
		});
		this.viewModel.onDismiss();
	};

	handleShuffle = (): void => {
		this.collectFirstPages({ sort: 'random' }).then((tracks) => {
			if (tracks.length > 0) {
				this.viewModel.playbackStore.playTracks(shuffleArray(tracks));
			}
		});
		this.viewModel.onDismiss();
	};

	onRender(): void {
		const { animationsEnabled, title } = this.viewModel;

		<ModalBase
			accessibilityId='home-context-menu'
			backdropAccessibilityId='home-context-backdrop'
			onDismiss={this.handleBackdropTap}
		>
			<label style={modalStyles.title} value={title} />
			<view style={modalStyles.divider} />
			<ContextMenuActionRow
				accessibilityId='home-context-play'
				animationsEnabled={animationsEnabled}
				icon={res.play}
				label={Strings.play()}
				onPress={this.handlePlay}
			/>
			<ContextMenuActionRow
				accessibilityId='home-context-play-next'
				animationsEnabled={animationsEnabled}
				icon={res.playnext}
				label={Strings.playNext()}
				onPress={this.handlePlayNext}
			/>
			<ContextMenuActionRow
				accessibilityId='home-context-add-to-queue'
				animationsEnabled={animationsEnabled}
				icon={res.addtoqueue}
				label={Strings.addToQueue()}
				onPress={this.handleAddToQueue}
			/>
			<ContextMenuActionRow
				accessibilityId='home-context-shuffle'
				animationsEnabled={animationsEnabled}
				icon={res.shuffle}
				label={Strings.shuffle()}
				onPress={this.handleShuffle}
			/>
			<ContextMenuActionRow
				accessibilityId='home-context-add-to-playlist'
				animationsEnabled={animationsEnabled}
				icon={res.addtoplaylist}
				label={Strings.addToPlaylist()}
				onPress={this.handleAddToPlaylist}
			/>
			<ContextMenuActionRow
				accessibilityId='home-context-create-playlist'
				animationsEnabled={animationsEnabled}
				icon={res.createnewplaylist}
				label={Strings.createNewPlaylist()}
				onPress={this.handleCreatePlaylist}
			/>
		</ModalBase>;
	}

	private collectFirstPages(options?: EntityTrackOptions): Promise<Array<Track>> {
		return Promise.all(
			this.sources(options).map((source) =>
				Promise.resolve(source(1, TRACK_PAGE_SIZE)).then(
					(page) => page.items,
					() => [] as Array<Track>,
				),
			),
		).then((pages) => pages.flat());
	}

	private sources(options?: EntityTrackOptions): Array<TrackSource> {
		return this.viewModel.items.map((item) =>
			entityTrackSource(item, this.viewModel.transport, options),
		);
	}
}
