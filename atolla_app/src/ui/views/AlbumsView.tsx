import type { Album } from 'atolla_core/src/models/Album';
import Strings from 'atolla_core/src/Strings';
import { buildImageSource } from 'atolla_core/src/services/ImageSource';
import type { Transport } from 'atolla_core/src/transports/Transport';
import { matchesLetterFilter } from 'atolla_core/src/utils/SortKey';
import type { DownloadService } from 'atolla_player/src/services/DownloadService';
import type { TrackSource } from 'atolla_player/src/services/TrackSource';
import type { PlaybackStore } from 'atolla_player/src/stores/Playback';
import type { CancelablePromise } from 'valdi_core/src/CancelablePromise';
import { StatefulComponent } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';
import type { NavigationController } from 'valdi_navigation/src/NavigationController';
import type { ScrollView, View } from 'valdi_tsx/src/NativeTemplateElements';
import { preloadAtollaImages } from '../../ImageLoaderBootstrap';
import type { LyricsService } from '../../services/LyricsService';
import type { NetworkStatus } from '../../services/NetworkStatus';
import type { PaletteGenerationQueue } from '../../services/PaletteGenerationQueue';
import type { ToastService } from '../../services/ToastService';
import type { ViewCache } from '../../services/ViewCache';
import type { PinnedItemsStore } from '../../stores/PinnedItems';
import type { Preferences } from '../../stores/Preferences';
import { theme } from '../../theme';
import { CancelableController } from '../../utils/CancelableController';
import { type Card, CardGrid } from '../components/CardGrid';
import { EmptyState } from '../components/EmptyState';
import { RefreshableScroll } from '../components/RefreshableScroll';
import { openCardContextMenu } from '../flows/CardContextMenu';
import { createPlaylistAndAddTracks } from '../flows/CreatePlaylist';
import { type DetailPushDeps, pushAlbum, pushArtist } from '../flows/PushDetail';
import type { CardContextMenuCard } from '../modals/CardContextMenu';
import { CreatePlaylistModal } from '../modals/CreatePlaylistModal';
import { createPagedGridController, gridPaginationConfig } from '../pagination/Grid';
import { AddToPlaylistView } from './AddToPlaylistView';
import { sortAlbums } from './sort/Albums';

export interface AlbumsViewModel {
	downloadService: DownloadService;
	isOfflineMode: boolean;
	letterFilter?: string | null;
	lyricsService: LyricsService;
	modalSlot: DetachedSlot;
	navigationController: NavigationController;
	networkStatus: NetworkStatus;
	offlineDataInvalidations: number;
	paletteQueue?: PaletteGenerationQueue;
	pinnedItemsStore?: PinnedItemsStore;
	playbackStore: PlaybackStore;
	preferences: Preferences;
	toastService: ToastService;
	transport: Transport;
	viewCache: ViewCache;
}

interface AlbumsState {
	addToPlaylistTracks: TrackSource | null;
	albums: Array<Album>;
	contextMenuCard: CardContextMenuCard | null;
	createPlaylistTracks: TrackSource | null;
	hasMore: boolean;
	isLoadingNextPage: boolean;
	isRefreshing: boolean;
	nextPageFailed: boolean;
	page: number;
	revision: number;
}

interface AlbumPageResult {
	hasMore: boolean;
	items: Array<Album>;
}

export class AlbumsView extends StatefulComponent<AlbumsViewModel, AlbumsState> {
	state: AlbumsState = {
		addToPlaylistTracks: null,
		albums: [],
		contextMenuCard: null,
		createPlaylistTracks: null,
		hasMore: true,
		isLoadingNextPage: false,
		isRefreshing: false,
		nextPageFailed: false,
		page: 0,
		revision: 0,
	};

	onCreate(): void {
		this.registerDisposable(this.viewModel.preferences.subscribe(this.bump));
		this.registerDisposable(() => this.pagedGridController.dispose());
		this.registerDisposable(this.playlistFlow.cancel);
		this.seedFromCache();
		void this.loadInitialPages();
	}

	onViewModelUpdate(prevViewModel?: AlbumsViewModel): void {
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
			albums: [],
			hasMore: true,
			isLoadingNextPage: false,
			nextPageFailed: false,
			page: 0,
		});
		this.seedFromCache();
		void this.loadInitialPages();
	}

	onRender(): void {
		const { toastService, transport } = this.viewModel;
		const { animationsEnabled, gridColumns } = this.viewModel.preferences;
		const { addToPlaylistTracks, createPlaylistTracks } = this.state;

		const cards = this.createAlbumCards(this.getDisplayAlbums());
		<view style={styles.container}>
			<RefreshableScroll
				accessibilityId='library-albums'
				isRefreshing={this.state.isRefreshing}
				onRefresh={this.handleRefresh}
				style={styles.scroll}
			>
				<CardGrid
					accessibilityId='library-albums-grid'
					cards={cards}
					columnCount={gridColumns}
					infiniteScrollTriggerRatio={gridPaginationConfig.nextPageTriggerRatio}
					isLoadingMore={this.state.isLoadingNextPage}
					onCardLongPress={this.handleAlbumCardLongPress}
					onCardTap={this.handleAlbumCardTap}
					onLoadMore={this.state.hasMore && !this.state.nextPageFailed ? this.loadMore : undefined}
					onRetryLoadMore={this.state.nextPageFailed ? this.retryLoadMore : undefined}
				/>
			</RefreshableScroll>
			<EmptyState
				hasMore={this.state.hasMore}
				isOfflineMode={this.viewModel.isOfflineMode}
				itemCount={this.state.albums.length}
				message={Strings.nothingDownloaded()}
			/>

			{addToPlaylistTracks && (
				<AddToPlaylistView
					animationsEnabled={animationsEnabled}
					gridColumns={this.viewModel.preferences.gridColumns}
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

	handleAlbumCardLongPress = (card: {
		id: string;
		kind: 'album' | 'artist' | 'genre' | 'playlist';
	}): void => {
		const album = this.state.albums.find((candidate) => candidate.id === card.id);
		if (!album) return;

		this.setState({ contextMenuCard: { album, kind: 'album' } });

		openCardContextMenu(this.viewModel.modalSlot, {
			animationsEnabled: this.viewModel.preferences.animationsEnabled,
			card: { album, kind: 'album' },
			isPinned: this.viewModel.pinnedItemsStore?.isPinned('album', album.id) ?? false,
			onAddToPlaylist: this.handleContextMenuAddToPlaylist,
			onArtistTap: album.artistId
				? () => {
						this.handleContextMenuDismiss();

						this.viewModel.transport.getArtist(album.artistId).then((artist) => {
							const resolvedArtist = artist ?? {
								id: album.artistId,
								name: album.artistName,
							};
							pushArtist(this.viewModel.navigationController, this.detailDeps(), resolvedArtist);
						});
					}
				: undefined,
			onCreatePlaylist: this.handleCreatePlaylistRequest,
			onDismiss: this.handleContextMenuDismiss,
			onEntityTap: this.handleContextMenuEntityTap,
			onPin: () => {
				void this.viewModel.pinnedItemsStore?.pin({ album, kind: 'album' });
			},
			onUnpin: () => {
				void this.viewModel.pinnedItemsStore?.unpin('album', album.id);
			},
			playbackStore: this.viewModel.playbackStore,
			toastService: this.viewModel.toastService,
			transport: this.viewModel.transport,
		});
	};

	retryLoadMore = (): void => {
		void this.pagedGridController.loadNextPage();
	};

	private bump = (): void => {
		this.setState({ revision: this.state.revision + 1 });
	};

	private cachedAlbumCards: Array<Card> = [];
	private cachedAlbumCardsSource: Array<Album> | null = null;
	private cachedDisplayAlbums: Array<Album> = [];
	private cachedDisplayAlbumsRef: Array<Album> | null = null;
	private cachedDisplayLetterFilter: string | null | undefined = undefined;
	private cachedDisplayIsOffline = false;
	private pendingCreatePlaylistTracks: TrackSource | null = null;
	private playlistFlow = new CancelableController(() => this.isDestroyed());

	private cacheKey(): string {
		return `list:albums:${this.viewModel.letterFilter ?? 'all'}`;
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
		const cached = this.viewModel.viewCache.get<Array<Album>>(key);
		if (cached && cached.length > 0) {
			this.setState({ albums: cached });
			return;
		}
		void this.viewModel.viewCache.load<Array<Album>>(key).then((disk) => {
			if (disk && disk.length > 0 && !this.isDestroyed() && this.state.albums.length === 0) {
				this.setState({ albums: disk });
			}
		});
	}

	private async loadInitialPages(): Promise<void> {
		await this.pagedGridController.loadNextPage();
	}

	private readonly pagedGridController = createPagedGridController<Album>({
		fetchPage: (page) => this.fetchPage(page),
		isDestroyed: () => this.isDestroyed(),
		onPageLoaded: (items) => this.preloadAlbumImages(items),
		setState: (patch) => {
			if (patch.page === 1 && patch.items) {
				this.viewModel.viewCache.store(this.cacheKey(), patch.items);
			}
			this.setState({
				albums: patch.items ?? this.state.albums,
				hasMore: patch.hasMore ?? this.state.hasMore,
				isLoadingNextPage: patch.isLoadingNextPage ?? this.state.isLoadingNextPage,
				nextPageFailed: patch.nextPageFailed ?? this.state.nextPageFailed,
				page: patch.page ?? this.state.page,
			});
		},
	});

	private preloadAlbumImages(items: Array<Album>): void {
		try {
			preloadAtollaImages(
				items.map((item) =>
					buildImageSource({ category: 'album_art_thumb', id: item.id, url: item.imageUrl }),
				),
			);
		} catch {
			// non-Android targets have no native preload bridge
		}
	}

	private fetchPage(page: number): CancelablePromise<AlbumPageResult> {
		return this.viewModel.transport.getAlbums(page, gridPaginationConfig.pageSize, {
			startsWith: this.viewModel.letterFilter ?? undefined,
		});
	}

	private handleAddToPlaylistDismiss = (): void => {
		this.setState({ addToPlaylistTracks: null });
	};

	private detailDeps(): DetailPushDeps {
		return {
			downloadService: this.viewModel.downloadService,
			lyricsService: this.viewModel.lyricsService,
			modalSlot: this.viewModel.modalSlot,
			networkStatus: this.viewModel.networkStatus,
			paletteQueue: this.viewModel.paletteQueue,
			pinnedItemsStore: this.viewModel.pinnedItemsStore,
			playbackStore: this.viewModel.playbackStore,
			preferences: this.viewModel.preferences,
			toastService: this.viewModel.toastService,
			transport: this.viewModel.transport,
			viewCache: this.viewModel.viewCache,
		};
	}

	private handleAlbumCardTap = (card: {
		id: string;
		kind: 'album' | 'artist' | 'genre' | 'playlist';
	}): void => {
		const album = this.state.albums.find((a) => a.id === card.id);
		if (!album) {
			return;
		}

		pushAlbum(this.viewModel.navigationController, this.detailDeps(), album);
	};

	private handleContextMenuDismiss = (): void => {
		this.setState({ contextMenuCard: null });
	};

	private handleContextMenuAddToPlaylist = (tracks: TrackSource): void => {
		this.setState({ addToPlaylistTracks: tracks, contextMenuCard: null });
	};

	private handleContextMenuEntityTap = (): void => {
		const card = this.state.contextMenuCard;
		if (card?.kind !== 'album') {
			return;
		}
		this.handleContextMenuDismiss();
		pushAlbum(this.viewModel.navigationController, this.detailDeps(), card.album);
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

	private handleCreatePlaylistRequest = (tracks: TrackSource): void => {
		this.pendingCreatePlaylistTracks = tracks;
		this.setState({ contextMenuCard: null, createPlaylistTracks: tracks });
	};

	private createAlbumCards(albums: Array<Album>): Array<Card> {
		if (albums !== this.cachedAlbumCardsSource) {
			this.cachedAlbumCardsSource = albums;
			this.cachedAlbumCards = albums.map((album) => ({
				artworkKey: album.imageUrl ?? '',
				id: album.id,
				kind: 'album',
				primaryText: album.name,
				secondaryText: album.artistName,
			}));
		}

		return this.cachedAlbumCards;
	}

	private getDisplayAlbums(): Array<Album> {
		const letterFilter = this.viewModel.letterFilter;
		const isOffline = this.viewModel.isOfflineMode;

		if (
			this.state.albums === this.cachedDisplayAlbumsRef &&
			letterFilter === this.cachedDisplayLetterFilter &&
			isOffline === this.cachedDisplayIsOffline
		) {
			return this.cachedDisplayAlbums;
		}

		this.cachedDisplayAlbumsRef = this.state.albums;
		this.cachedDisplayLetterFilter = letterFilter;
		this.cachedDisplayIsOffline = isOffline;

		let albums = sortAlbums(this.state.albums);
		if (letterFilter) {
			albums = albums.filter((a) => matchesLetterFilter(a, letterFilter));
		}
		this.cachedDisplayAlbums = albums;
		return albums;
	}

	private loadMore = (): void => {
		void this.pagedGridController.loadNextPage();
	};
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
