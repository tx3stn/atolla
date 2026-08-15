import type { CancelablePromise } from 'valdi_core/src/CancelablePromise';
import { StatefulComponent } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';
import type { NavigationController } from 'valdi_navigation/src/NavigationController';
import type { ScrollView, View } from 'valdi_tsx/src/NativeTemplateElements';
import { preloadAtollaImages } from '../../ImageLoaderBootstrap';
import type { Playlist } from '../../models/Playlist';
import Strings from '../../Strings';
import type { DownloadService } from '../../services/DownloadService';
import type { ImageCache } from '../../services/ImageCache';
import { normalizeImageUrlForCategory } from '../../services/ImageSource';
import type { NetworkStatus } from '../../services/NetworkStatus';
import type { PaletteGenerationQueue } from '../../services/PaletteGenerationQueue';
import type { PlaylistEditService } from '../../services/PlaylistEditService';
import type { ToastService } from '../../services/ToastService';
import type { TrackSource } from '../../services/TrackSource';
import type { ViewCache } from '../../services/ViewCache';
import type { PinnedItemsStore } from '../../stores/PinnedItems';
import type { PlaybackStore } from '../../stores/Playback';
import type { Preferences } from '../../stores/Preferences';
import { theme } from '../../theme';
import type { Transport } from '../../transports/Transport';
import { CancelableController } from '../../utils/CancelableController';
import { matchesLetterFilter } from '../../utils/SortKey';
import type { CardContextMenuCard } from '../components/CardContextMenu';
import { type Card, CardGrid } from '../components/CardGrid';
import { CreatePlaylistModal } from '../components/CreatePlaylistModal';
import { EmptyState } from '../components/EmptyState';
import { RefreshableScroll } from '../components/RefreshableScroll';
import { openCardContextMenu } from '../flows/CardContextMenu';
import { createPlaylistAndAddTracks } from '../flows/CreatePlaylist';
import { type DetailPushDeps, pushPlaylist } from '../flows/PushDetail';
import { createPagedGridController, gridPaginationConfig } from '../pagination/Grid';
import { AddToPlaylistView } from './AddToPlaylistView';
import { sortPlaylists } from './sort/Playlists';

export interface PlaylistsViewModel {
	downloadService: DownloadService;
	imageCache: ImageCache;
	isOfflineMode: boolean;
	letterFilter?: string | null;
	modalSlot: DetachedSlot;
	navigationController: NavigationController;
	networkStatus: NetworkStatus;
	offlineDataInvalidations: number;
	onNavigateToArtist?: (artistId: string) => void;
	paletteQueue?: PaletteGenerationQueue;
	pinnedItemsStore?: PinnedItemsStore;
	playbackStore: PlaybackStore;
	playlistEditService: PlaylistEditService;
	preferences: Preferences;
	toastService: ToastService;
	transport: Transport;
	viewCache: ViewCache;
}

interface PlaylistsState {
	addToPlaylistTracks: TrackSource | null;
	contextMenuCard: CardContextMenuCard | null;
	createPlaylistTracks: TrackSource | null;
	hasMore: boolean;
	isLoadingNextPage: boolean;
	isRefreshing: boolean;
	nextPageFailed: boolean;
	page: number;
	playlists: Array<Playlist>;
	revision: number;
}

interface PlaylistPageResult {
	hasMore: boolean;
	items: Array<Playlist>;
}

export class PlaylistsView extends StatefulComponent<PlaylistsViewModel, PlaylistsState> {
	private cachedDisplayLetterFilter: string | null | undefined = undefined;
	private cachedDisplayPlaylists: Array<Playlist> = [];
	private cachedDisplayPlaylistsRef: Array<Playlist> | null = null;
	private cachedPlaylistCards: Array<Card> = [];
	private cachedPlaylistCardsSource: Array<Playlist> | null = null;
	private pendingCreatePlaylistTracks: TrackSource | null = null;
	private playlistFlow = new CancelableController(() => this.isDestroyed());

	state: PlaylistsState = {
		addToPlaylistTracks: null,
		contextMenuCard: null,
		createPlaylistTracks: null,
		hasMore: true,
		isLoadingNextPage: false,
		isRefreshing: false,
		nextPageFailed: false,
		page: 0,
		playlists: [],
		revision: 0,
	};

	onCreate(): void {
		this.registerDisposable(this.viewModel.preferences.subscribe(this.bump));
		this.registerDisposable(() => this.pagedGridController.dispose());
		this.registerDisposable(this.playlistFlow.cancel);
		this.seedFromCache();
		void this.loadInitialPages();
	}

	onViewModelUpdate(prevViewModel?: PlaylistsViewModel): void {
		if (!prevViewModel) {
			return;
		}

		const offlineChanged = this.viewModel.isOfflineMode !== prevViewModel.isOfflineMode;
		const filterChanged = this.viewModel.letterFilter !== prevViewModel.letterFilter;
		const offlineDataInvalidated =
			this.viewModel.isOfflineMode &&
			this.viewModel.offlineDataInvalidations !== prevViewModel.offlineDataInvalidations;

		if (!offlineChanged && !filterChanged && !offlineDataInvalidated) {
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
		this.seedFromCache();
		void this.loadInitialPages();
	}

	handlePlaylistCardLongPress = (card: {
		id: string;
		kind: 'album' | 'artist' | 'genre' | 'playlist';
	}): void => {
		const playlist = this.state.playlists.find((candidate) => candidate.id === card.id);
		if (!playlist) return;

		this.setState({ contextMenuCard: { kind: 'playlist', playlist } });
		openCardContextMenu(this.viewModel.modalSlot, {
			animationsEnabled: this.viewModel.preferences.animationsEnabled,
			card: { kind: 'playlist', playlist },
			isPinned: this.viewModel.pinnedItemsStore?.isPinned('playlist', playlist.id) ?? false,
			onAddToPlaylist: this.handleContextMenuAddToPlaylist,
			onCreatePlaylist: this.handleCreatePlaylistRequest,
			onDismiss: this.handleContextMenuDismiss,
			onEntityTap: this.handleContextMenuEntityTap,
			onPin: () => {
				void this.viewModel.pinnedItemsStore?.pin({ kind: 'playlist', playlist });
			},
			onUnpin: () => {
				void this.viewModel.pinnedItemsStore?.unpin('playlist', playlist.id);
			},
			playbackStore: this.viewModel.playbackStore,
			toastService: this.viewModel.toastService,
			transport: this.viewModel.transport,
		});
	};

	private readonly pagedGridController = createPagedGridController<Playlist>({
		fetchPage: (page) => this.fetchPage(page),
		isDestroyed: () => this.isDestroyed(),
		onPageLoaded: (items) => this.preloadPlaylistImages(items),
		setState: (patch) => {
			if (patch.page === 1 && patch.items) {
				this.viewModel.viewCache.store(this.cacheKey(), patch.items);
			}
			this.setState({
				hasMore: patch.hasMore ?? this.state.hasMore,
				isLoadingNextPage: patch.isLoadingNextPage ?? this.state.isLoadingNextPage,
				nextPageFailed: patch.nextPageFailed ?? this.state.nextPageFailed,
				page: patch.page ?? this.state.page,
				playlists: patch.items ?? this.state.playlists,
			});
		},
	});

	private bump = (): void => {
		this.setState({ revision: this.state.revision + 1 });
	};

	private createPlaylistCards(playlists: Array<Playlist>): Array<Card> {
		if (playlists !== this.cachedPlaylistCardsSource) {
			this.cachedPlaylistCardsSource = playlists;
			this.cachedPlaylistCards = playlists.map((playlist) => ({
				artworkKey: playlist.imageUrl ?? '',
				id: playlist.id,
				kind: 'playlist',
				primaryText: playlist.name,
				secondaryText: '',
			}));
		}

		return this.cachedPlaylistCards;
	}

	private getDisplayPlaylists(): Array<Playlist> {
		const letterFilter = this.viewModel.letterFilter;

		if (
			this.state.playlists === this.cachedDisplayPlaylistsRef &&
			letterFilter === this.cachedDisplayLetterFilter
		) {
			return this.cachedDisplayPlaylists;
		}

		this.cachedDisplayPlaylistsRef = this.state.playlists;
		this.cachedDisplayLetterFilter = letterFilter;

		let playlists = sortPlaylists(this.state.playlists);
		if (letterFilter) {
			playlists = playlists.filter((p) => matchesLetterFilter(p, letterFilter));
		}
		this.cachedDisplayPlaylists = playlists;
		return playlists;
	}

	private cacheKey(): string {
		return `list:playlists:${this.viewModel.letterFilter ?? 'all'}`;
	}

	private handleRefresh = (): void => {
		if (this.state.isRefreshing) {
			return;
		}
		this.viewModel.viewCache.invalidate(this.cacheKey());
		this.pagedGridController.reset();
		this.setState({ hasMore: true, isRefreshing: true, nextPageFailed: false, page: 0 });
		void this.pagedGridController.loadNextPage().then(() => {
			if (!this.isDestroyed()) {
				this.setState({ isRefreshing: false });
			}
		});
	};

	private seedFromCache(): void {
		const key = this.cacheKey();
		const cached = this.viewModel.viewCache.get<Array<Playlist>>(key);
		if (cached && cached.length > 0) {
			this.setState({ playlists: cached });
			return;
		}
		void this.viewModel.viewCache.load<Array<Playlist>>(key).then((disk) => {
			if (disk && disk.length > 0 && !this.isDestroyed() && this.state.playlists.length === 0) {
				this.setState({ playlists: disk });
			}
		});
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
			// non-Android targets have no native preload bridge
		}
	}

	private fetchPage(page: number): CancelablePromise<PlaylistPageResult> {
		return this.viewModel.transport.getPlaylists(page, gridPaginationConfig.pageSize, {
			startsWith: this.viewModel.letterFilter ?? undefined,
		});
	}

	private loadMore = (): void => {
		void this.pagedGridController.loadNextPage();
	};

	private retryLoadMore = (): void => {
		void this.pagedGridController.loadNextPage();
	};

	private handleContextMenuDismiss = (): void => {
		this.setState({ contextMenuCard: null });
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

	private detailDeps(): DetailPushDeps {
		return {
			downloadService: this.viewModel.downloadService,
			imageCache: this.viewModel.imageCache,
			modalSlot: this.viewModel.modalSlot,
			networkStatus: this.viewModel.networkStatus,
			onNavigateToArtist: this.viewModel.onNavigateToArtist,
			paletteQueue: this.viewModel.paletteQueue,
			pinnedItemsStore: this.viewModel.pinnedItemsStore,
			playbackStore: this.viewModel.playbackStore,
			playlistEditService: this.viewModel.playlistEditService,
			preferences: this.viewModel.preferences,
			toastService: this.viewModel.toastService,
			transport: this.viewModel.transport,
			viewCache: this.viewModel.viewCache,
		};
	}

	private navigateToPlaylist(playlist: Playlist): void {
		pushPlaylist(this.viewModel.navigationController, this.detailDeps(), playlist);
	}

	private handleContextMenuAddToPlaylist = (tracks: TrackSource): void => {
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

	private handleCreatePlaylistRequest = (tracks: TrackSource): void => {
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

		try {
			const { alive } = await this.playlistFlow.run(
				createPlaylistAndAddTracks(
					name,
					(playlistName) => this.viewModel.transport.createPlaylist(playlistName),
					(playlistId, trackIds) =>
						this.viewModel.transport.addItemsToPlaylist(playlistId, trackIds),
					tracks,
					{ isCancelled: () => this.isDestroyed() },
				),
			);
			if (!alive) return;
		} catch {
			if (this.isDestroyed()) return;
		}
		this.pendingCreatePlaylistTracks = null;
		this.setState({ createPlaylistTracks: null });
	};

	onRender(): void {
		const { addToPlaylistTracks, createPlaylistTracks } = this.state;

		const cards = this.createPlaylistCards(this.getDisplayPlaylists());
		<view style={styles.container}>
			<RefreshableScroll
				accessibilityId='library-playlists'
				isRefreshing={this.state.isRefreshing}
				onRefresh={this.handleRefresh}
				style={styles.scroll}
			>
				<CardGrid
					accessibilityId='library-playlists-grid'
					cards={cards}
					columnCount={this.viewModel.preferences.gridColumns}
					infiniteScrollTriggerRatio={gridPaginationConfig.nextPageTriggerRatio}
					isLoadingMore={this.state.isLoadingNextPage}
					onCardLongPress={this.handlePlaylistCardLongPress}
					onCardTap={this.handlePlaylistCardTap}
					onLoadMore={this.state.hasMore && !this.state.nextPageFailed ? this.loadMore : undefined}
					onRetryLoadMore={this.state.nextPageFailed ? this.retryLoadMore : undefined}
				/>
			</RefreshableScroll>
			<EmptyState
				hasMore={this.state.hasMore}
				isOfflineMode={this.viewModel.isOfflineMode}
				itemCount={this.state.playlists.length}
				message={Strings.nothingDownloaded()}
			/>

			{addToPlaylistTracks && (
				<AddToPlaylistView
					animationsEnabled={this.viewModel.preferences.animationsEnabled}
					gridColumns={this.viewModel.preferences.gridColumns}
					imageCache={this.viewModel.imageCache}
					onDismiss={this.handleAddToPlaylistDismiss}
					toastService={this.viewModel.toastService}
					tracks={addToPlaylistTracks}
					transport={this.viewModel.transport}
				/>
			)}
			{createPlaylistTracks && (
				<CreatePlaylistModal
					animationsEnabled={this.viewModel.preferences.animationsEnabled}
					onCancel={this.handleCreatePlaylistCancel}
					onCreate={this.handleCreatePlaylistConfirm}
				/>
			)}
		</view>;
	}
}

const styles = {
	container: new Style<View>({
		flexGrow: 1,
		position: 'relative',
	}),
	scroll: new Style<ScrollView>({
		backgroundColor: theme.colors.bg,
		flexGrow: 1,
		padding: theme.scale(8),
		paddingBottom: theme.padding.scrollBottom,
		paddingTop: theme.padding.scrollHeader(null),
		width: '100%',
	}),
};
