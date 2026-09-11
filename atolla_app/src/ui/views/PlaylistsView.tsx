import Strings from 'atolla_app/src/Strings';
import type { Playlist } from 'atolla_core/src/models/Playlist';
import { buildImageSource } from 'atolla_core/src/services/ImageSource';
import type { Transport } from 'atolla_core/src/transports/Transport';
import { matchesLetterFilter } from 'atolla_core/src/utils/SortKey';
import type { DownloadService } from 'atolla_player/src/services/DownloadService';
import type { PlaylistEditService } from 'atolla_player/src/services/PlaylistEditService';
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
import { type DetailPushDeps, pushPlaylist } from '../flows/PushDetail';
import type { CardContextMenuCard } from '../modals/CardContextMenu';
import { createPagedGridController, gridPaginationConfig } from '../pagination/Grid';
import { sortPlaylists } from './sort/Playlists';

export interface PlaylistsViewModel {
	downloadService: DownloadService;
	isOfflineMode: boolean;
	letterFilter?: string | null;
	lyricsService: LyricsService;
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
	contextMenuCard: CardContextMenuCard | null;
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
	private playlistFlow = new CancelableController(() => this.isDestroyed());

	state: PlaylistsState = {
		contextMenuCard: null,
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
			gridColumns: this.viewModel.preferences.gridColumns,
			isPinned: this.viewModel.pinnedItemsStore?.isPinned('playlist', playlist.id) ?? false,
			onDismiss: this.handleContextMenuDismiss,
			onEntityTap: this.handleContextMenuEntityTap,
			onPin: () => {
				void this.viewModel.pinnedItemsStore?.pin({ kind: 'playlist', playlist });
			},
			onUnpin: () => {
				void this.viewModel.pinnedItemsStore?.unpin('playlist', playlist.id);
			},
			playbackStore: this.viewModel.playbackStore,
			playlistFlow: this.playlistFlow,
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
				items.map((item) =>
					buildImageSource({ category: 'playlist_image_thumb', id: item.id, url: item.imageUrl }),
				),
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
			lyricsService: this.viewModel.lyricsService,
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

	private handleContextMenuEntityTap = (): void => {
		const card = this.state.contextMenuCard;
		if (card?.kind !== 'playlist') {
			return;
		}
		this.handleContextMenuDismiss();
		this.navigateToPlaylist(card.playlist);
	};

	onRender(): void {
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
