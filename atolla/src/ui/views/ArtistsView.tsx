import { StatefulComponent } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';
import type { NavigationController } from 'valdi_navigation/src/NavigationController';
import type { ScrollView, View } from 'valdi_tsx/src/NativeTemplateElements';
import { preloadAtollaImages } from '../../ImageLoaderBootstrap';
import type { Artist } from '../../models/Artist';
import type { Track } from '../../models/Track';
import type { DownloadService } from '../../services/DownloadService';
import type { ImageCache } from '../../services/ImageCache';
import { normalizeImageUrlForCategory } from '../../services/ImageSource';
import type { PaletteGenerationQueue } from '../../services/PaletteGenerationQueue';
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
import { sortArtists } from './ArtistsSort';
import { ArtistView } from './ArtistView';
import { bindFooterVisibility } from './footerVisibility';
import { gridPaginationConfig } from './GridPagination';
import type { LibraryNavContext } from './LibraryView';
import { createPagedGridController } from './pagination/createPagedGridController';

export interface ArtistsViewModel {
	animationsEnabled: boolean;
	downloadService: DownloadService;
	gridColumns: number;
	imageCache: ImageCache;
	isOfflineMode: boolean;
	letterFilter?: string | null;
	modalSlot?: DetachedSlot;
	navBarContext?: NavBarContext;
	navigationController: NavigationController;
	onHeaderVisibilityChange?: (isVisible: boolean) => void;
	onNavigationContext?: (context: LibraryNavContext | null) => void;
	paletteQueue?: PaletteGenerationQueue;
	playbackStore: PlaybackStore;
	sortOrder?: SortOrder;
	transport: Transport;
}

interface ArtistsState {
	addToPlaylistTracks: Array<Track> | null;
	artists: Array<Artist>;
	contextMenuCard: CardContextMenuCard | null;
	createPlaylistTracks: Array<Track> | null;
	hasMore: boolean;
	isFooterVisible: boolean;
	isLoadingNextPage: boolean;
	nextPageFailed: boolean;
	page: number;
	toastMessage: string | null;
}

interface ArtistPageResult {
	hasMore: boolean;
	items: Array<Artist>;
}

interface PagedArtistsTransport {
	getArtistsPage: (page: number, pageSize: number) => Promise<ArtistPageResult>;
}

export class ArtistsView extends StatefulComponent<ArtistsViewModel, ArtistsState> {
	private allArtists: Array<Artist> | null = null;
	private hasBeenDestroyed = false;
	private readonly pagedGridController = createPagedGridController<Artist>({
		fetchPage: (page) => this.fetchPage(page),
		isDestroyed: () => this.hasBeenDestroyed,
		onPageLoaded: (items) => this.preloadArtistImages(items),
		setState: (patch) => {
			this.setState({
				artists: patch.items ?? this.state.artists,
				hasMore: patch.hasMore ?? this.state.hasMore,
				isLoadingNextPage: patch.isLoadingNextPage ?? this.state.isLoadingNextPage,
				nextPageFailed: patch.nextPageFailed ?? this.state.nextPageFailed,
				page: patch.page ?? this.state.page,
			});
		},
	});
	private toastTimerId?: ReturnType<typeof setTimeout>;
	private unsubscribePlayback?: () => void;
	private cachedDisplayArtists: Array<Artist> = [];
	private cachedDisplayArtistsRef: Array<Artist> | null = null;
	private cachedDisplaySortOrder: SortOrder | undefined = undefined;
	private cachedDisplayLetterFilter: string | null | undefined = undefined;
	private cachedDisplayIsOffline = false;
	private pendingCreatePlaylistTracks: Array<Track> | null = null;

	state: ArtistsState = {
		addToPlaylistTracks: null,
		artists: [],
		contextMenuCard: null,
		createPlaylistTracks: null,
		hasMore: true,
		isFooterVisible: false,
		isLoadingNextPage: false,
		nextPageFailed: false,
		page: 0,
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

	onViewModelUpdate(prevViewModel?: ArtistsViewModel): void {
		if (!prevViewModel) {
			return;
		}

		const offlineChanged = this.viewModel.isOfflineMode !== prevViewModel.isOfflineMode;
		const filterChanged = this.viewModel.letterFilter !== prevViewModel.letterFilter;

		if (!offlineChanged && !filterChanged) {
			return;
		}

		this.allArtists = null;
		this.pagedGridController.reset();
		this.setState({
			artists: [],
			hasMore: true,
			isLoadingNextPage: false,
			nextPageFailed: false,
			page: 0,
		});
		void this.loadInitialPages();
	}

	private async loadInitialPages(): Promise<void> {
		await this.pagedGridController.loadNextPage();
	}

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
			// Non-Android targets do not provide native preload bridge.
		}
	}

	private fetchPage(page: number): Promise<ArtistPageResult> {
		const sort = this.viewModel.sortOrder ?? SortOrders.aToZ;

		if (shouldUseLocalSortedList(this.viewModel)) {
			if (!this.allArtists) {
				return this.viewModel.transport.getAllArtists().then((artists) => {
					this.allArtists = sortArtistsForView(artists, sort, true);
					return { hasMore: false, items: this.allArtists };
				});
			}

			this.allArtists = sortArtistsForView(this.allArtists, sort, true);
			return Promise.resolve({ hasMore: false, items: this.allArtists });
		}

		const transport = this.viewModel.transport as Transport & Partial<PagedArtistsTransport>;
		if (transport.getArtistsPage) {
			return transport.getArtistsPage(page, gridPaginationConfig.pageSize);
		}

		if (!this.allArtists) {
			return this.viewModel.transport.getAllArtists().then((artists) => {
				this.allArtists = sortArtistsForView(artists, sort, false);
				const start = (page - 1) * gridPaginationConfig.pageSize;
				const end = start + gridPaginationConfig.pageSize;
				return { hasMore: end < this.allArtists.length, items: this.allArtists.slice(start, end) };
			});
		}

		this.allArtists = sortArtistsForView(this.allArtists, sort, false);

		const start = (page - 1) * gridPaginationConfig.pageSize;
		const end = start + gridPaginationConfig.pageSize;
		return Promise.resolve({
			hasMore: end < this.allArtists.length,
			items: this.allArtists.slice(start, end),
		});
	}

	retryLoadMore(): void {
		void this.pagedGridController.loadNextPage();
	}

	loadMore(): void {
		void this.pagedGridController.loadNextPage();
	}

	handleArtistCardLongPress = (card: {
		id: string;
		kind: 'album' | 'artist' | 'genre' | 'playlist';
	}): void => {
		const artist = this.state.artists.find((candidate) => candidate.id === card.id);
		if (!artist) return;
		this.setState({ contextMenuCard: { artist, kind: 'artist' } });
		openCardContextMenu(this.viewModel.navBarContext?.modalSlot ?? this.viewModel.modalSlot, {
			animationsEnabled: this.viewModel.animationsEnabled,
			card: { artist, kind: 'artist' },
			imageCache: this.viewModel.imageCache,
			onAddToPlaylist: this.handleContextMenuAddToPlaylist,
			onArtistTap: this.handleContextMenuArtistTap,
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

	private navigateToArtist = (artist: Artist): void => {
		const {
			animationsEnabled,
			imageCache,
			navigationController,
			paletteQueue,
			playbackStore,
			transport,
		} = this.viewModel;
		this.viewModel.onNavigationContext?.({ artist, kind: 'artist' });
		this.viewModel.onHeaderVisibilityChange?.(false);
		navigationController.push(
			ArtistView,
			{
				animationsEnabled,
				artist,
				downloadService: this.viewModel.downloadService,
				gridColumns: this.viewModel.gridColumns,
				imageCache,
				modalSlot: this.viewModel.navBarContext?.modalSlot ?? this.viewModel.modalSlot,
				navBarContext: this.viewModel.navBarContext,
				onHeaderVisibilityChange: this.viewModel.onHeaderVisibilityChange,
				onNavigationContext: this.viewModel.onNavigationContext,
				paletteQueue,
				playbackStore,
				transport,
			},
			{},
			{ animated: animationsEnabled },
		);
	};

	private handleArtistCardTap = (card: {
		id: string;
		kind: 'album' | 'artist' | 'genre' | 'playlist';
	}): void => {
		const artist = this.state.artists.find((a) => a.id === card.id);
		if (!artist) return;
		this.navigateToArtist(artist);
	};

	private handleContextMenuAddToPlaylist = (tracks: Array<Track>): void => {
		this.setState({ addToPlaylistTracks: tracks, contextMenuCard: null });
	};

	private handleContextMenuArtistTap = (): void => {
		const card = this.state.contextMenuCard;
		if (!card || card.kind !== 'artist') return;
		this.navigateToArtist(card.artist);
	};

	private handleContextMenuEntityTap = (): void => {
		this.handleContextMenuArtistTap();
	};

	private handleCreatePlaylistRequest = (tracks: Array<Track>): void => {
		this.pendingCreatePlaylistTracks = tracks;
		this.setState({ contextMenuCard: null, createPlaylistTracks: tracks });
	};

	private handleAddToPlaylistDismiss = (): void => {
		this.setState({ addToPlaylistTracks: null });
	};

	private handleCreatePlaylistCancel = (): void => {
		this.pendingCreatePlaylistTracks = null;
		this.setState({ createPlaylistTracks: null });
	};

	private handleCreatePlaylistConfirm = async (name: string): Promise<void> => {
		const createPlaylistFn = this.viewModel.transport.createPlaylist?.bind(
			this.viewModel.transport,
		);
		const tracks = this.pendingCreatePlaylistTracks;
		if (!createPlaylistFn || !tracks) return;
		await createPlaylistAndAddTracks(
			name,
			createPlaylistFn,
			this.viewModel.transport.addItemToPlaylist?.bind(this.viewModel.transport),
			tracks,
		);
		this.pendingCreatePlaylistTracks = null;
		this.setState({ createPlaylistTracks: null });
	};

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

		let artists = sortArtistsForView(
			this.state.artists,
			sort,
			shouldUseLocalSortedList(this.viewModel),
		);
		if (letterFilter) {
			artists = artists.filter((a) => matchesArtistLetterFilter(a.name, letterFilter));
		}
		this.cachedDisplayArtists = artists;
		return artists;
	}

	onRender(): void {
		const { imageCache, animationsEnabled, transport } = this.viewModel;
		const { addToPlaylistTracks, createPlaylistTracks, toastMessage } = this.state;
		const createPlaylistFn = transport.createPlaylist?.bind(transport);

		const artists = this.getDisplayArtists();

		const cards: Array<Card> = artists.map((artist) => ({
			artworkKey: artist.imageUrl ?? '',
			id: artist.id,
			kind: 'artist',
			primaryText: artist.name,
			secondaryText: '',
		}));
		<view style={styles.container}>
			<scroll style={createScrollStyle(this.state.isFooterVisible)}>
				<CardGrid
					accessibilityId='library-artists-grid'
					cards={cards}
					columnCount={this.viewModel.gridColumns}
					infiniteScrollTriggerRatio={gridPaginationConfig.nextPageTriggerRatio}
					isLoadingMore={this.state.isLoadingNextPage}
					onCardLongPress={this.handleArtistCardLongPress}
					onCardTap={this.handleArtistCardTap}
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

function shouldUseLocalSortedList(viewModel: ArtistsViewModel): boolean {
	if (viewModel.isOfflineMode) {
		return true;
	}
	if (viewModel.letterFilter) {
		return true;
	}

	const transport = viewModel.transport as Transport & Partial<PagedArtistsTransport>;
	return !transport.getArtistsPage;
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
