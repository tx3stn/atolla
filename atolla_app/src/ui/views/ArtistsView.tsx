import Strings from 'atolla_app/src/Strings';
import type { Artist } from 'atolla_core/src/models/Artist';
import { buildImageSource } from 'atolla_core/src/services/ImageSource';
import type { Transport } from 'atolla_core/src/transports/Transport';
import { matchesLetterFilter } from 'atolla_core/src/utils/SortKey';
import type { DownloadService } from 'atolla_player/src/services/DownloadService';
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
import { type DetailPushDeps, pushArtist } from '../flows/PushDetail';
import type { CardContextMenuCard } from '../modals/CardContextMenu';
import { createPagedGridController, gridPaginationConfig } from '../pagination/Grid';
import { sortArtists } from './sort/Artists';

export interface ArtistsViewModel {
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

interface ArtistsState {
	artists: Array<Artist>;
	contextMenuCard: CardContextMenuCard | null;
	hasMore: boolean;
	isLoadingNextPage: boolean;
	isRefreshing: boolean;
	nextPageFailed: boolean;
	page: number;
	revision: number;
}

interface ArtistPageResult {
	hasMore: boolean;
	items: Array<Artist>;
}

export class ArtistsView extends StatefulComponent<ArtistsViewModel, ArtistsState> {
	state: ArtistsState = {
		artists: [],
		contextMenuCard: null,
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

	onRender(): void {
		const cards = this.createArtistCards(this.getDisplayArtists());
		<view style={styles.container}>
			<RefreshableScroll
				accessibilityId='library-artists'
				isRefreshing={this.state.isRefreshing}
				onRefresh={this.handleRefresh}
				style={styles.scroll}
			>
				<CardGrid
					accessibilityId='library-artists-grid'
					cards={cards}
					columnCount={this.viewModel.preferences.gridColumns}
					infiniteScrollTriggerRatio={gridPaginationConfig.nextPageTriggerRatio}
					isLoadingMore={this.state.isLoadingNextPage}
					onCardLongPress={this.handleArtistCardLongPress}
					onCardTap={this.handleArtistCardTap}
					onLoadMore={this.state.hasMore && !this.state.nextPageFailed ? this.loadMore : undefined}
					onRetryLoadMore={this.state.nextPageFailed ? this.retryLoadMore : undefined}
				/>
			</RefreshableScroll>
			<EmptyState
				hasMore={this.state.hasMore}
				isOfflineMode={this.viewModel.isOfflineMode}
				itemCount={this.state.artists.length}
				message={Strings.nothingDownloaded()}
			/>
		</view>;
	}

	onViewModelUpdate(prevViewModel?: ArtistsViewModel): void {
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
			artists: [],
			hasMore: true,
			isLoadingNextPage: false,
			nextPageFailed: false,
			page: 0,
		});
		this.seedFromCache();
		void this.loadInitialPages();
	}

	handleArtistCardLongPress = (card: {
		id: string;
		kind: 'album' | 'artist' | 'genre' | 'playlist';
	}): void => {
		const artist = this.state.artists.find((candidate) => candidate.id === card.id);
		if (!artist) return;
		this.setState({ contextMenuCard: { artist, kind: 'artist' } });
		openCardContextMenu(this.viewModel.modalSlot, {
			animationsEnabled: this.viewModel.preferences.animationsEnabled,
			card: { artist, kind: 'artist' },
			gridColumns: this.viewModel.preferences.gridColumns,
			isPinned: this.viewModel.pinnedItemsStore?.isPinned('artist', artist.id) ?? false,
			onArtistTap: this.handleContextMenuArtistTap,
			onDismiss: this.handleContextMenuDismiss,
			onEntityTap: this.handleContextMenuEntityTap,
			onPin: () => {
				void this.viewModel.pinnedItemsStore?.pin({ artist, kind: 'artist' });
			},
			onUnpin: () => {
				void this.viewModel.pinnedItemsStore?.unpin('artist', artist.id);
			},
			playbackStore: this.viewModel.playbackStore,
			playlistFlow: this.playlistFlow,
			toastService: this.viewModel.toastService,
			transport: this.viewModel.transport,
		});
	};

	private cachedArtistCards: Array<Card> = [];
	private cachedArtistCardsSource: Array<Artist> | null = null;
	private cachedDisplayArtists: Array<Artist> = [];
	private cachedDisplayArtistsRef: Array<Artist> | null = null;
	private cachedDisplayLetterFilter: string | null | undefined = undefined;
	private cachedDisplayIsOffline = false;
	private playlistFlow = new CancelableController(() => this.isDestroyed());

	private createArtistCards(artists: Array<Artist>): Array<Card> {
		if (artists !== this.cachedArtistCardsSource) {
			this.cachedArtistCardsSource = artists;
			this.cachedArtistCards = artists.map((artist) => ({
				artworkKey: artist.imageUrl ?? '',
				id: artist.id,
				kind: 'artist',
				primaryText: artist.name,
				secondaryText: '',
			}));
		}

		return this.cachedArtistCards;
	}

	private fetchPage(page: number): CancelablePromise<ArtistPageResult> {
		return this.viewModel.transport.getArtists(page, gridPaginationConfig.pageSize, {
			startsWith: this.viewModel.letterFilter ?? undefined,
		});
	}

	private getDisplayArtists(): Array<Artist> {
		const letterFilter = this.viewModel.letterFilter;
		const isOffline = this.viewModel.isOfflineMode;

		if (
			this.state.artists === this.cachedDisplayArtistsRef &&
			letterFilter === this.cachedDisplayLetterFilter &&
			isOffline === this.cachedDisplayIsOffline
		) {
			return this.cachedDisplayArtists;
		}

		this.cachedDisplayArtistsRef = this.state.artists;
		this.cachedDisplayLetterFilter = letterFilter;
		this.cachedDisplayIsOffline = isOffline;

		let artists = sortArtistsForView(this.state.artists, this.viewModel.isOfflineMode);
		if (letterFilter) {
			artists = artists.filter((a) => matchesLetterFilter(a, letterFilter));
		}
		this.cachedDisplayArtists = artists;
		return artists;
	}
	private handleArtistCardTap = (card: {
		id: string;
		kind: 'album' | 'artist' | 'genre' | 'playlist';
	}): void => {
		const artist = this.state.artists.find((a) => a.id === card.id);
		if (!artist) return;
		this.navigateToArtist(artist);
	};

	private handleContextMenuArtistTap = (): void => {
		const card = this.state.contextMenuCard;
		if (card?.kind !== 'artist') return;
		this.navigateToArtist(card.artist);
	};

	private handleContextMenuEntityTap = (): void => {
		this.handleContextMenuArtistTap();
	};

	private handleContextMenuDismiss = (): void => {
		this.setState({ contextMenuCard: null });
	};

	private cacheKey(): string {
		return `list:artists:${this.viewModel.letterFilter ?? 'all'}`;
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
		const cached = this.viewModel.viewCache.get<Array<Artist>>(key);
		if (cached && cached.length > 0) {
			this.setState({ artists: cached });
			return;
		}
		void this.viewModel.viewCache.load<Array<Artist>>(key).then((disk) => {
			if (disk && disk.length > 0 && !this.isDestroyed() && this.state.artists.length === 0) {
				this.setState({ artists: disk });
			}
		});
	}

	private async loadInitialPages(): Promise<void> {
		await this.pagedGridController.loadNextPage();
	}

	private loadMore = async (): Promise<void> => {
		if (this.state.hasMore && !this.state.nextPageFailed) {
			await this.pagedGridController.loadNextPage();
		}
	};

	private bump = (): void => {
		this.setState({ revision: this.state.revision + 1 });
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

	private navigateToArtist = (artist: Artist): void => {
		pushArtist(this.viewModel.navigationController, this.detailDeps(), artist);
	};

	private readonly pagedGridController = createPagedGridController<Artist>({
		fetchPage: (page) => this.fetchPage(page),
		isDestroyed: () => this.isDestroyed(),
		onPageLoaded: (items) => this.preloadArtistImages(items),
		setState: (patch) => {
			if (patch.page === 1 && patch.items) {
				this.viewModel.viewCache.store(this.cacheKey(), patch.items);
			}
			this.setState({
				artists: patch.items ?? this.state.artists,
				hasMore: patch.hasMore ?? this.state.hasMore,
				isLoadingNextPage: patch.isLoadingNextPage ?? this.state.isLoadingNextPage,
				nextPageFailed: patch.nextPageFailed ?? this.state.nextPageFailed,
				page: patch.page ?? this.state.page,
			});
		},
	});

	private preloadArtistImages(items: Array<Artist>): void {
		try {
			preloadAtollaImages(
				items.map((item) =>
					buildImageSource({ category: 'artist_image_thumb', id: item.id, url: item.imageUrl }),
				),
			);
		} catch {
			// non-Android targets have no native preload bridge
		}
	}

	private retryLoadMore = (): void => {
		if (this.state.nextPageFailed) {
			void this.pagedGridController.loadNextPage();
		}
	};
}

function sortArtistsForView(artists: Array<Artist>, shouldSortLocally: boolean): Array<Artist> {
	if (!shouldSortLocally) {
		return artists;
	}

	return sortArtists(artists);
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
