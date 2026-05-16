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
import type { PlaybackStore } from '../../stores/Playback';
import { scrollPaddingBottom, theme, topInset } from '../../theme';
import type { Transport } from '../../transports/Transport';
import type { CardContextMenuCard } from '../components/CardContextMenu';
import { type Card, CardGrid } from '../components/CardGrid';
import { CreatePlaylistModal } from '../components/CreatePlaylistModal';
import { type SortOrder, SortOrders } from '../components/SortNavPanel';
import { Toast } from '../components/Toast';
import { scheduleToastDismiss } from '../components/toastTimer';
import { openCardContextMenu } from '../flows/cardContextMenuFlow';
import { createPlaylistAndAddTracks } from '../flows/playlistFlow';
import type { NavBarContext } from '../NavBarContext';
import { AddToPlaylistView } from './AddToPlaylistView';
import { bindFooterVisibility } from './footerVisibility';
import { gridPaginationConfig } from './GridPagination';
import type { LibraryNavContext } from './LibraryView';
import { sortPlaylists } from './PlaylistsSort';
import { PlaylistView } from './PlaylistView';
import { createPagedGridController } from './pagination/createPagedGridController';

export interface PlaylistsViewModel {
	animationsEnabled: boolean;
	downloadService: DownloadService;
	gridColumns: number;
	imageCache: ImageCache;
	letterFilter?: string | null;
	modalSlot?: DetachedSlot;
	navBarContext?: NavBarContext;
	navigationController: NavigationController;
	onHeaderVisibilityChange?: (isVisible: boolean) => void;
	onNavigateToArtist?: (artistId: string) => void;
	onNavigationContext?: (context: LibraryNavContext | null) => void;
	paletteQueue?: PaletteGenerationQueue;
	playbackStore: PlaybackStore;
	playlistEditService: PlaylistEditService;
	sortOrder?: SortOrder;
	transport: Transport;
}

interface PlaylistsState {
	addToPlaylistTracks: Array<Track> | null;
	contextMenuCard: CardContextMenuCard | null;
	createPlaylistTracks: Array<Track> | null;
	hasMore: boolean;
	isFooterVisible: boolean;
	isLoadingNextPage: boolean;
	nextPageFailed: boolean;
	page: number;
	playlists: Array<Playlist>;
	toastMessage: string | null;
}

interface PlaylistPageResult {
	hasMore: boolean;
	items: Array<Playlist>;
}

interface PagedPlaylistsTransport {
	getPlaylistsPage: (page: number, pageSize: number) => Promise<PlaylistPageResult>;
}

export class PlaylistsView extends StatefulComponent<PlaylistsViewModel, PlaylistsState> {
	private allPlaylists: Array<Playlist> | null = null;
	private hasBeenDestroyed = false;
	private readonly pagedGridController = createPagedGridController<Playlist>({
		fetchPage: (page) => this.fetchPage(page),
		isDestroyed: () => this.hasBeenDestroyed,
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
	private pendingCreatePlaylistTracks: Array<Track> | null = null;
	private toastTimerId?: ReturnType<typeof setTimeout>;
	private unsubscribePlayback?: () => void;

	state: PlaylistsState = {
		addToPlaylistTracks: null,
		contextMenuCard: null,
		createPlaylistTracks: null,
		hasMore: true,
		isFooterVisible: false,
		isLoadingNextPage: false,
		nextPageFailed: false,
		page: 0,
		playlists: [],
		toastMessage: null,
	};

	onCreate(): void {
		this.hasBeenDestroyed = false;
		this.unsubscribePlayback = bindFooterVisibility({
			getIsFooterVisible: () => this.state.isFooterVisible,
			playbackStore: this.viewModel.playbackStore,
			setIsFooterVisible: (isFooterVisible) => {
				this.setState({ isFooterVisible });
			},
		});
		void this.loadInitialPages();
	}

	onDestroy(): void {
		this.hasBeenDestroyed = true;
		this.unsubscribePlayback?.();
		if (this.toastTimerId) clearTimeout(this.toastTimerId);
	}

	onViewModelUpdate(prevViewModel?: PlaylistsViewModel): void {
		if (!prevViewModel) {
			return;
		}
		if (this.viewModel.letterFilter === prevViewModel.letterFilter) {
			return;
		}

		this.allPlaylists = null;
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
			// Non-Android targets do not provide native preload bridge.
		}
	}

	private fetchPage(page: number): Promise<PlaylistPageResult> {
		const sort = this.viewModel.sortOrder ?? SortOrders.aToZ;
		const transport = this.viewModel.transport as Transport & Partial<PagedPlaylistsTransport>;

		if (this.viewModel.letterFilter || !transport.getPlaylistsPage) {
			if (!this.allPlaylists) {
				return this.viewModel.transport.getAllPlaylists().then((playlists) => {
					this.allPlaylists = sortPlaylists(playlists, sort);
					return { hasMore: false, items: this.allPlaylists };
				});
			}
			this.allPlaylists = sortPlaylists(this.allPlaylists, sort);
			return Promise.resolve({ hasMore: false, items: this.allPlaylists });
		}

		return transport.getPlaylistsPage(page, gridPaginationConfig.pageSize);
	}

	retryLoadMore(): void {
		void this.pagedGridController.loadNextPage();
	}

	loadMore(): void {
		void this.pagedGridController.loadNextPage();
	}

	handlePlaylistCardLongPress = (card: {
		id: string;
		kind: 'album' | 'artist' | 'genre' | 'playlist';
	}): void => {
		const playlist = this.state.playlists.find((candidate) => candidate.id === card.id);
		if (!playlist) return;
		this.setState({ contextMenuCard: { kind: 'playlist', playlist } });
		openCardContextMenu(this.viewModel.navBarContext?.modalSlot ?? this.viewModel.modalSlot, {
			animationsEnabled: this.viewModel.animationsEnabled,
			card: { kind: 'playlist', playlist },
			imageCache: this.viewModel.imageCache,
			onAddToPlaylist: this.handleContextMenuAddToPlaylist,
			onCreatePlaylist: this.viewModel.transport.createPlaylist
				? this.handleCreatePlaylistRequest
				: undefined,
			onDismiss: this.handleContextMenuDismiss,
			onEntityTap: this.handleContextMenuEntityTap,
			playbackStore: this.viewModel.playbackStore,
			transport: this.viewModel.transport,
		});
	};

	handleContextMenuDismiss = (toastMessage?: string): void => {
		this.setState({ contextMenuCard: null });
		if (toastMessage) {
			this.toastTimerId = scheduleToastDismiss(
				this.toastTimerId,
				(message) => {
					this.setState({ toastMessage: message });
				},
				toastMessage,
			);
		}
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
			navigationController,
			onNavigateToArtist,
			paletteQueue,
			playbackStore,
			transport,
		} = this.viewModel;
		this.viewModel.onNavigationContext?.({ kind: 'playlist', playlist });
		this.viewModel.onHeaderVisibilityChange?.(false);
		navigationController.push(
			PlaylistView,
			{
				animationsEnabled,
				downloadService: this.viewModel.downloadService,
				gridColumns: this.viewModel.gridColumns,
				imageCache,
				navBarContext: this.viewModel.navBarContext,
				onHeaderVisibilityChange: this.viewModel.onHeaderVisibilityChange,
				onNavigateToArtist,
				onNavigationContext: this.viewModel.onNavigationContext,
				paletteQueue,
				playbackStore,
				playlist,
				playlistEditService: this.viewModel.playlistEditService,
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
		if (!card || card.kind !== 'playlist') {
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
		const createPlaylistFn = this.viewModel.transport.createPlaylist?.bind(
			this.viewModel.transport,
		);
		const tracks = this.pendingCreatePlaylistTracks;
		if (!createPlaylistFn || !tracks) {
			return;
		}

		await createPlaylistAndAddTracks(
			name,
			createPlaylistFn,
			this.viewModel.transport.addItemToPlaylist?.bind(this.viewModel.transport),
			tracks,
		);
		this.pendingCreatePlaylistTracks = null;
		this.setState({ createPlaylistTracks: null });
	};

	onRender(): void {
		const { animationsEnabled, imageCache, transport } = this.viewModel;
		const { addToPlaylistTracks, createPlaylistTracks, toastMessage } = this.state;
		const createPlaylistFn = transport.createPlaylist?.bind(transport);

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
			<scroll style={createScrollStyle(this.state.isFooterVisible)}>
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
					tracks={addToPlaylistTracks}
					transport={transport}
				/>
			)}
			{createPlaylistTracks && createPlaylistFn && (
				<CreatePlaylistModal
					onCancel={this.handleCreatePlaylistCancel}
					onCreate={this.handleCreatePlaylistConfirm}
				/>
			)}
			{toastMessage && <Toast message={toastMessage} />}
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
};

function createScrollStyle(isFooterVisible: boolean): Style<ScrollView> {
	return new Style<ScrollView>({
		backgroundColor: theme.colors.bg,
		flexGrow: 1,
		padding: 8,
		paddingBottom: scrollPaddingBottom(isFooterVisible),
		paddingTop: theme.headerHeight + topInset,
		width: '100%',
	});
}
