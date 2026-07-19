import type { CancelablePromise } from 'valdi_core/src/CancelablePromise';
import { StatefulComponent } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';
import type { NavigationController } from 'valdi_navigation/src/NavigationController';
import type { ScrollView, View } from 'valdi_tsx/src/NativeTemplateElements';
import { preloadAtollaImages } from '../../ImageLoaderBootstrap';
import type { Artist } from '../../models/Artist';
import Strings from '../../Strings';
import type { DownloadService } from '../../services/DownloadService';
import type { ImageCache } from '../../services/ImageCache';
import { normalizeImageUrlForCategory } from '../../services/ImageSource';
import type { PaletteGenerationQueue } from '../../services/PaletteGenerationQueue';
import type { ToastService } from '../../services/ToastService';
import type { TrackSource } from '../../services/TrackSource';
import type { ViewCache } from '../../services/ViewCache';
import type { PlaybackStore } from '../../stores/Playback';
import type { Preferences } from '../../stores/Preferences';
import { theme } from '../../theme';
import type { Transport } from '../../transports/Transport';
import { CancelableController } from '../../utils/CancelableController';
import type { CardContextMenuCard } from '../components/CardContextMenu';
import { type Card, CardGrid } from '../components/CardGrid';
import { CreatePlaylistModal } from '../components/CreatePlaylistModal';
import { EmptyState } from '../components/EmptyState';
import { RefreshableScroll } from '../components/RefreshableScroll';
import { type SortOrder, SortOrders } from '../components/SortNavPanel';
import { openCardContextMenu } from '../flows/CardContextMenu';
import { createPlaylistAndAddTracks } from '../flows/CreatePlaylist';
import { type DetailPushDeps, pushArtist } from '../flows/PushDetail';
import { createPagedGridController, gridPaginationConfig } from '../pagination/Grid';
import { AddToPlaylistView } from './AddToPlaylistView';
import { sortArtists } from './sort/Artists';

export interface ArtistsViewModel {
	downloadService: DownloadService;
	imageCache: ImageCache;
	isOfflineMode: boolean;
	letterFilter?: string | null;
	modalSlot: DetachedSlot;
	navigationController: NavigationController;
	onRootDetailControllerReady: (controller: NavigationController) => void;
	paletteQueue?: PaletteGenerationQueue;
	playbackStore: PlaybackStore;
	preferences: Preferences;
	sortOrder?: SortOrder;
	toastService: ToastService;
	transport: Transport;
	viewCache: ViewCache;
}

interface ArtistsState {
	addToPlaylistTracks: TrackSource | null;
	artists: Array<Artist>;
	contextMenuCard: CardContextMenuCard | null;
	createPlaylistTracks: TrackSource | null;
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
		addToPlaylistTracks: null,
		artists: [],
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

	onRender(): void {
		const { imageCache, toastService, transport } = this.viewModel;
		const { animationsEnabled } = this.viewModel.preferences;
		const { addToPlaylistTracks, createPlaylistTracks } = this.state;

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

			{addToPlaylistTracks && (
				<AddToPlaylistView
					animationsEnabled={animationsEnabled}
					gridColumns={this.viewModel.preferences.gridColumns}
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

	onViewModelUpdate(prevViewModel?: ArtistsViewModel): void {
		if (!prevViewModel) {
			return;
		}

		const offlineChanged = this.viewModel.isOfflineMode !== prevViewModel.isOfflineMode;
		const filterChanged = this.viewModel.letterFilter !== prevViewModel.letterFilter;

		if (!offlineChanged && !filterChanged) {
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
			onAddToPlaylist: this.handleContextMenuAddToPlaylist,
			onArtistTap: this.handleContextMenuArtistTap,
			onCreatePlaylist: this.handleCreatePlaylistRequest,
			onDismiss: this.handleContextMenuDismiss,
			onEntityTap: this.handleContextMenuEntityTap,
			playbackStore: this.viewModel.playbackStore,
			transport: this.viewModel.transport,
		});
	};

	private cachedArtistCards: Array<Card> = [];
	private cachedArtistCardsSource: Array<Artist> | null = null;
	private cachedDisplayArtists: Array<Artist> = [];
	private cachedDisplayArtistsRef: Array<Artist> | null = null;
	private cachedDisplaySortOrder: SortOrder | undefined = undefined;
	private cachedDisplayLetterFilter: string | null | undefined = undefined;
	private cachedDisplayIsOffline = false;
	private pendingCreatePlaylistTracks: TrackSource | null = null;
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
		const sort = this.viewModel.sortOrder ?? SortOrders.aToZ;
		const letterFilter = this.viewModel.letterFilter;
		const isOffline = this.viewModel.isOfflineMode;

		if (
			this.state.artists === this.cachedDisplayArtistsRef &&
			sort === this.cachedDisplaySortOrder &&
			letterFilter === this.cachedDisplayLetterFilter &&
			isOffline === this.cachedDisplayIsOffline
		) {
			return this.cachedDisplayArtists;
		}

		this.cachedDisplayArtistsRef = this.state.artists;
		this.cachedDisplaySortOrder = sort;
		this.cachedDisplayLetterFilter = letterFilter;
		this.cachedDisplayIsOffline = isOffline;

		let artists = sortArtistsForView(this.state.artists, sort, this.viewModel.isOfflineMode);
		if (letterFilter) {
			artists = artists.filter((a) => matchesArtistLetterFilter(a.name, letterFilter));
		}
		this.cachedDisplayArtists = artists;
		return artists;
	}
	private handleAddToPlaylistDismiss = (): void => {
		this.setState({ addToPlaylistTracks: null });
	};

	private handleArtistCardTap = (card: {
		id: string;
		kind: 'album' | 'artist' | 'genre' | 'playlist';
	}): void => {
		const artist = this.state.artists.find((a) => a.id === card.id);
		if (!artist) return;
		this.navigateToArtist(artist);
	};

	private handleContextMenuAddToPlaylist = (tracks: TrackSource): void => {
		this.setState({ addToPlaylistTracks: tracks, contextMenuCard: null });
	};

	private handleContextMenuArtistTap = (): void => {
		const card = this.state.contextMenuCard;
		if (card?.kind !== 'artist') return;
		this.navigateToArtist(card.artist);
	};

	private handleContextMenuEntityTap = (): void => {
		this.handleContextMenuArtistTap();
	};

	private handleCreatePlaylistCancel = (): void => {
		this.pendingCreatePlaylistTracks = null;
		this.setState({ createPlaylistTracks: null });
	};

	private handleCreatePlaylistConfirm = async (name: string): Promise<void> => {
		const tracks = this.pendingCreatePlaylistTracks;
		if (!tracks) return;
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

	private handleContextMenuDismiss = (toastMessage?: string): void => {
		this.setState({ contextMenuCard: null });
		if (toastMessage) {
			this.viewModel.toastService.show(toastMessage);
		}
	};

	private cacheKey(): string {
		const filter = this.viewModel.letterFilter ?? 'all';
		const mode = this.viewModel.isOfflineMode ? 'offline' : 'online';
		return `list:artists:${filter}:${mode}`;
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
			imageCache: this.viewModel.imageCache,
			modalSlot: this.viewModel.modalSlot,
			onRootDetailControllerReady: this.viewModel.onRootDetailControllerReady,
			paletteQueue: this.viewModel.paletteQueue,
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
				items
					.map((a) => a.imageUrl)
					.filter((url): url is string => url != null)
					.map((url) => normalizeImageUrlForCategory(url, 'artist_image_thumb')),
				'artist_image_thumb',
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

function sortArtistsForView(
	artists: Array<Artist>,
	sort: SortOrder,
	shouldSortLocally: boolean,
): Array<Artist> {
	if (!shouldSortLocally && sort === SortOrders.aToZ) {
		return artists;
	}

	return sortArtists(artists, sort);
}

function matchesArtistLetterFilter(name: string, letter: string): boolean {
	if (letter === '0') {
		return /^\d/.test(name.trim());
	}
	return name.trim().toLowerCase().startsWith(letter.toLowerCase());
}

const styles = {
	container: new Style<View>({
		flexGrow: 1,
		position: 'relative',
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
