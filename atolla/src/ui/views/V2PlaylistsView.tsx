import { StatefulComponent } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';
import type { NavigationController } from 'valdi_navigation/src/NavigationController';
import type { ScrollView, View } from 'valdi_tsx/src/NativeTemplateElements';
import { preloadAtollaImages } from '../../ImageLoaderBootstrap';
import type { Playlist } from '../../models/Playlist';
import type { Track } from '../../models/Track';
import type { DownloadService } from '../../services/DownloadService';
import type { ImageCache } from '../../services/ImageCache';
import { normalizeImageUrlForCategory } from '../../services/ImageSource';
import type { PaletteGenerationQueue } from '../../services/PaletteGenerationQueue';
import type { PlaylistEditService } from '../../services/PlaylistEditService';
import type { ToastService } from '../../services/ToastService';
import type { PlaybackStore } from '../../stores/Playback';
import { theme } from '../../theme';
import type { Transport } from '../../transports/Transport';
import type { CardContextMenuCard } from '../components/CardContextMenu';
import { type Card, CardGrid } from '../components/CardGrid';
import { CreatePlaylistModal } from '../components/CreatePlaylistModal';
import { type SortOrder, SortOrders } from '../components/SortNavPanel';
import { openCardContextMenu } from '../flows/CardContextMenu';
import { createPlaylistAndAddTracks } from '../flows/CreatePlaylist';
import { createPagedGridController, gridPaginationConfig } from '../pagination/Grid';
import { AddToPlaylistView } from './AddToPlaylistView';
import { sortPlaylists } from './sort/Playlists';
import { PlaylistView } from './V2PlaylistView';

export interface PlaylistsViewModel {
	animationsEnabled: boolean;
	downloadService: DownloadService;
	gridColumns: number;
	imageCache: ImageCache;
	letterFilter?: string | null;
	modalSlot: DetachedSlot;
	navigationController: NavigationController;
	onNavigateToArtist?: (artistId: string) => void;
	onRootDetailControllerReady: (controller: NavigationController) => void;
	paletteQueue?: PaletteGenerationQueue;
	playbackStore: PlaybackStore;
	playlistEditService: PlaylistEditService;
	sortOrder?: SortOrder;
	toastService: ToastService;
	transport: Transport;
}

interface PlaylistsState {
	addToPlaylistTracks: Array<Track> | null;
	contextMenuCard: CardContextMenuCard | null;
	createPlaylistTracks: Array<Track> | null;
	hasMore: boolean;
	isLoadingNextPage: boolean;
	nextPageFailed: boolean;
	page: number;
	playlists: Array<Playlist>;
}

interface PlaylistPageResult {
	hasMore: boolean;
	items: Array<Playlist>;
}

export class PlaylistsView extends StatefulComponent<PlaylistsViewModel, PlaylistsState> {
	private pendingCreatePlaylistTracks: Array<Track> | null = null;

	state: PlaylistsState = {
		addToPlaylistTracks: null,
		contextMenuCard: null,
		createPlaylistTracks: null,
		hasMore: true,
		isLoadingNextPage: false,
		nextPageFailed: false,
		page: 0,
		playlists: [],
	};

	onCreate(): void {
		void this.loadInitialPages();
	}

	onViewModelUpdate(prevViewModel?: PlaylistsViewModel): void {
		if (!prevViewModel) {
			return;
		}
		if (this.viewModel.letterFilter === prevViewModel.letterFilter) {
			return;
		}

		this.pagedGridController.reset();
		this.setState({
			hasMore: true,
			isLoadingNextPage: false,
			nextPageFailed: false,
			page: 0,
			playlists: [],
		});
		void this.loadInitialPages();
	}

	private readonly pagedGridController = createPagedGridController<Playlist>({
		fetchPage: (page) => this.fetchPage(page),
		isDestroyed: () => this.isDestroyed(),
		onPageLoaded: (items) => this.preloadPlaylistImages(items),
		setState: (patch) => {
			this.setState({
				hasMore: patch.hasMore ?? this.state.hasMore,
				isLoadingNextPage: patch.isLoadingNextPage ?? this.state.isLoadingNextPage,
				nextPageFailed: patch.nextPageFailed ?? this.state.nextPageFailed,
				page: patch.page ?? this.state.page,
				playlists: patch.items ?? this.state.playlists,
			});
		},
	});

	private async loadInitialPages(): Promise<void> {
		await this.pagedGridController.loadNextPage();
	}

	private preloadPlaylistImages(items: Array<Playlist>): void {
		try {
			preloadAtollaImages(
				items
					.map((p) => p.imageUrl)
					.filter((url): url is string => url != null)
					.map((url) => normalizeImageUrlForCategory(url, 'playlist_image_thumb')),
				'playlist_image_thumb',
			);
		} catch {
			// non-Android targets have no native preload bridge
		}
	}

	private fetchPage(page: number): Promise<PlaylistPageResult> {
		return this.viewModel.transport.getPlaylistsPage(page, gridPaginationConfig.pageSize, {
			startsWith: this.viewModel.letterFilter ?? undefined,
		});
	}

	private loadMore(): void {
		void this.pagedGridController.loadNextPage();
	}

	private retryLoadMore(): void {
		void this.pagedGridController.loadNextPage();
	}

	private handleContextMenuDismiss = (toastMessage?: string): void => {
		this.setState({ contextMenuCard: null });
		if (toastMessage) {
			this.viewModel.toastService.show(toastMessage);
		}
	};

	private handlePlaylistCardLongPress = (card: {
		id: string;
		kind: 'album' | 'artist' | 'genre' | 'playlist';
	}): void => {
		const playlist = this.state.playlists.find((candidate) => candidate.id === card.id);
		if (!playlist) return;

		this.setState({ contextMenuCard: { kind: 'playlist', playlist } });
		openCardContextMenu(this.viewModel.modalSlot, {
			animationsEnabled: this.viewModel.animationsEnabled,
			card: { kind: 'playlist', playlist },
			onAddToPlaylist: this.handleContextMenuAddToPlaylist,
			onCreatePlaylist: this.handleCreatePlaylistRequest,
			onDismiss: this.handleContextMenuDismiss,
			onEntityTap: this.handleContextMenuEntityTap,
			playbackStore: this.viewModel.playbackStore,
			transport: this.viewModel.transport,
		});
	};

	private handlePlaylistCardTap = (card: {
		id: string;
		kind: 'album' | 'artist' | 'genre' | 'playlist';
	}): void => {
		const playlist = this.state.playlists.find((p) => p.id === card.id);
		if (!playlist) {
			return;
		}

		this.navigateToPlaylist(playlist);
	};

	private navigateToPlaylist(playlist: Playlist): void {
		const {
			animationsEnabled,
			imageCache,
			modalSlot,
			onNavigateToArtist,
			paletteQueue,
			playbackStore,
			transport,
		} = this.viewModel;

		this.viewModel.navigationController.push(
			PlaylistView,
			{
				animationsEnabled,
				downloadService: this.viewModel.downloadService,
				gridColumns: this.viewModel.gridColumns,
				imageCache,
				modalSlot,
				navigationController: this.viewModel.navigationController,
				onNavigateToArtist,
				onRootDetailControllerReady: this.viewModel.onRootDetailControllerReady,
				paletteQueue,
				playbackStore,
				playlist,
				playlistEditService: this.viewModel.playlistEditService,
				toastService: this.viewModel.toastService,
				transport,
			},
			{},
			{ animated: animationsEnabled },
		);
	}

	private handleContextMenuAddToPlaylist = (tracks: Array<Track>): void => {
		this.setState({ addToPlaylistTracks: tracks, contextMenuCard: null });
	};

	private handleContextMenuEntityTap = (): void => {
		const card = this.state.contextMenuCard;
		if (card?.kind !== 'playlist') {
			return;
		}
		this.handleContextMenuDismiss();
		this.navigateToPlaylist(card.playlist);
	};

	private handleAddToPlaylistDismiss = (): void => {
		this.setState({ addToPlaylistTracks: null });
	};

	private handleCreatePlaylistRequest = (tracks: Array<Track>): void => {
		this.pendingCreatePlaylistTracks = tracks;
		this.setState({ contextMenuCard: null, createPlaylistTracks: tracks });
	};

	private handleCreatePlaylistCancel = (): void => {
		this.setState({ createPlaylistTracks: null });
		this.pendingCreatePlaylistTracks = null;
	};

	private handleCreatePlaylistConfirm = async (name: string): Promise<void> => {
		const tracks = this.pendingCreatePlaylistTracks;
		if (!tracks) {
			return;
		}

		await createPlaylistAndAddTracks(
			name,
			this.viewModel.transport.createPlaylist.bind(this.viewModel.transport),
			this.viewModel.transport.addItemToPlaylist.bind(this.viewModel.transport),
			tracks,
		);
		this.pendingCreatePlaylistTracks = null;
		this.setState({ createPlaylistTracks: null });
	};

	onRender(): void {
		const { animationsEnabled, imageCache, toastService, transport } = this.viewModel;
		const { addToPlaylistTracks, createPlaylistTracks } = this.state;

		const sort = this.viewModel.sortOrder ?? SortOrders.aToZ;
		let playlists = sortPlaylists(this.state.playlists, sort);
		if (this.viewModel.letterFilter) {
			const letter = this.viewModel.letterFilter;
			playlists = playlists.filter((p) => matchesLetterFilter(p.name, letter));
		}

		const cards: Array<Card> = playlists.map((playlist) => ({
			artworkKey: playlist.imageUrl ?? '',
			id: playlist.id,
			kind: 'playlist',
			primaryText: playlist.name,
			secondaryText: '',
		}));
		<view style={styles.container}>
			<scroll style={styles.scroll}>
				<CardGrid
					accessibilityId='library-playlists-grid'
					cards={cards}
					columnCount={this.viewModel.gridColumns}
					infiniteScrollTriggerRatio={gridPaginationConfig.nextPageTriggerRatio}
					isLoadingMore={this.state.isLoadingNextPage}
					onCardLongPress={this.handlePlaylistCardLongPress}
					onCardTap={this.handlePlaylistCardTap}
					onLoadMore={
						this.state.hasMore && !this.state.nextPageFailed ? () => this.loadMore() : undefined
					}
					onRetryLoadMore={this.state.nextPageFailed ? () => this.retryLoadMore() : undefined}
				/>
			</scroll>

			{addToPlaylistTracks && (
				<AddToPlaylistView
					animationsEnabled={animationsEnabled}
					gridColumns={this.viewModel.gridColumns}
					imageCache={imageCache}
					onDismiss={this.handleAddToPlaylistDismiss}
					toastService={toastService}
					tracks={addToPlaylistTracks}
					transport={transport}
				/>
			)}
			{createPlaylistTracks && (
				<CreatePlaylistModal
					animationsEnabled={animationsEnabled}
					onCancel={this.handleCreatePlaylistCancel}
					onCreate={this.handleCreatePlaylistConfirm}
				/>
			)}
		</view>;
	}
}

function matchesLetterFilter(name: string, letter: string): boolean {
	if (letter === '0') {
		return /^\d/.test(name.trim());
	}
	return name.trim().toLowerCase().startsWith(letter.toLowerCase());
}

const styles = {
	container: new Style<View>({
		flexGrow: 1,
	}),
	scroll: new Style<ScrollView>({
		backgroundColor: theme.colors.bg,
		flexGrow: 1,
		padding: 8,
		paddingBottom: theme.padding.scrollBottom,
		paddingTop: theme.padding.scrollHeader(null),
		width: '100%',
	}),
};
