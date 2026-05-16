import { StatefulComponent } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';
import type { NavigationController } from 'valdi_navigation/src/NavigationController';
import type { ScrollView, View } from 'valdi_tsx/src/NativeTemplateElements';
import { preloadAtollaImages } from '../../ImageLoaderBootstrap';
import type { Album } from '../../models/Album';
import type { Track } from '../../models/Track';
import type { DownloadService } from '../../services/DownloadService';
import type { ImageCache } from '../../services/ImageCache';
import { normalizeImageUrlForCategory } from '../../services/ImageSource';
import type { PaletteGenerationQueue } from '../../services/PaletteGenerationQueue';
import type { PlaybackStore } from '../../stores/Playback';
import { scrollPaddingBottom, theme, topInset } from '../../theme';
import type { Transport } from '../../transports/Transport';
import { CardContextMenu, type CardContextMenuCard } from '../components/CardContextMenu';
import { type Card, CardGrid } from '../components/CardGrid';
import { CreatePlaylistModal } from '../components/CreatePlaylistModal';
import { type SortOrder, SortOrders } from '../components/SortNavPanel';
import { Toast } from '../components/Toast';
import { scheduleToastDismiss } from '../components/toastTimer';
import { createPlaylistAndAddTracks } from '../flows/playlistFlow';
import type { NavBarContext } from '../NavBarContext';
import { AddToPlaylistView } from './AddToPlaylistView';
import { sortAlbums } from './AlbumsSort';
import { AlbumView } from './AlbumView';
import { ArtistView } from './ArtistView';
import { bindFooterVisibility } from './footerVisibility';
import { gridPaginationConfig } from './GridPagination';
import type { LibraryNavContext } from './LibraryView';
import { createPagedGridController } from './pagination/createPagedGridController';

export interface AlbumsViewModel {
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

interface AlbumsState {
	addToPlaylistTracks: Array<Track> | null;
	albums: Array<Album>;
	contextMenuCard: CardContextMenuCard | null;
	createPlaylistTracks: Array<Track> | null;
	hasMore: boolean;
	isFooterVisible: boolean;
	isLoadingNextPage: boolean;
	nextPageFailed: boolean;
	page: number;
	toastMessage: string | null;
}

interface AlbumPageResult {
	hasMore: boolean;
	items: Array<Album>;
}

interface PagedAlbumsTransport {
	getAlbumsPage: (page: number, pageSize: number) => Promise<AlbumPageResult>;
}

export class AlbumsView extends StatefulComponent<AlbumsViewModel, AlbumsState> {
	private allAlbums: Array<Album> | null = null;
	private hasBeenDestroyed = false;
	private readonly pagedGridController = createPagedGridController<Album>({
		appendItems: (current, pageItems, isFirstPage) =>
			isFirstPage ? pageItems : [...current, ...pageItems],
		fetchPage: (page) => this.fetchPage(page),
		getHasMore: () => this.state.hasMore,
		getItems: () => this.state.albums,
		isDestroyed: () => this.hasBeenDestroyed,
		onPageLoaded: (items) => this.preloadAlbumImages(items),
		setState: (patch) => {
			this.setState({
				albums: patch.items ?? this.state.albums,
				hasMore: patch.hasMore ?? this.state.hasMore,
				isLoadingNextPage: patch.isLoadingNextPage ?? this.state.isLoadingNextPage,
				nextPageFailed: patch.nextPageFailed ?? this.state.nextPageFailed,
				page: patch.page ?? this.state.page,
			});
		},
	});
	private toastTimerId?: ReturnType<typeof setTimeout>;
	private unsubscribePlayback?: () => void;
	private cachedDisplayAlbums: Array<Album> = [];
	private cachedDisplayAlbumsRef: Array<Album> | null = null;
	private cachedDisplaySortOrder: SortOrder | undefined = undefined;
	private cachedDisplayLetterFilter: string | null | undefined = undefined;
	private cachedDisplayIsOffline = false;
	private pendingCreatePlaylistTracks: Array<Track> | null = null;

	state: AlbumsState = {
		addToPlaylistTracks: null,
		albums: [],
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

	onViewModelUpdate(prevViewModel?: AlbumsViewModel): void {
		if (!prevViewModel) {
			return;
		}

		const offlineChanged = this.viewModel.isOfflineMode !== prevViewModel.isOfflineMode;
		const filterChanged = this.viewModel.letterFilter !== prevViewModel.letterFilter;

		if (!offlineChanged && !filterChanged) {
			return;
		}

		this.allAlbums = null;
		this.pagedGridController.reset();
		this.setState({
			albums: [],
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

	private preloadAlbumImages(items: Array<Album>): void {
		try {
			preloadAtollaImages(
				items
					.map((a) => a.imageUrl)
					.filter((url): url is string => url != null)
					.map((url) => normalizeImageUrlForCategory(url, 'album_art_thumb')),
				'album_art_thumb',
			);
		} catch {
			// Non-Android targets do not provide native preload bridge.
		}
	}

	private fetchPage(page: number): Promise<AlbumPageResult> {
		const sort = this.viewModel.sortOrder ?? SortOrders.newToOld;

		if (shouldUseLocalSortedList(this.viewModel)) {
			if (!this.allAlbums) {
				return this.viewModel.transport.getAllAlbums().then((albums) => {
					this.allAlbums = sortAlbumsForView(albums, sort, true);
					return { hasMore: false, items: this.allAlbums };
				});
			}

			this.allAlbums = sortAlbumsForView(this.allAlbums, sort, true);
			return Promise.resolve({ hasMore: false, items: this.allAlbums });
		}

		const transport = this.viewModel.transport as Transport & Partial<PagedAlbumsTransport>;
		if (transport.getAlbumsPage) {
			return transport.getAlbumsPage(page, gridPaginationConfig.pageSize);
		}

		if (!this.allAlbums) {
			return this.viewModel.transport.getAllAlbums().then((albums) => {
				this.allAlbums = albums;
				const sorted = sortAlbumsForView(this.allAlbums, sort, false);
				const start = (page - 1) * gridPaginationConfig.pageSize;
				const end = start + gridPaginationConfig.pageSize;
				return { hasMore: end < sorted.length, items: sorted.slice(start, end) };
			});
		}

		const sorted = sortAlbumsForView(this.allAlbums, sort, false);
		const start = (page - 1) * gridPaginationConfig.pageSize;
		const end = start + gridPaginationConfig.pageSize;
		return Promise.resolve({ hasMore: end < sorted.length, items: sorted.slice(start, end) });
	}

	retryLoadMore(): void {
		void this.pagedGridController.loadNextPage();
	}

	loadMore(): void {
		void this.pagedGridController.loadNextPage();
	}

	handleAlbumCardLongPress = (card: {
		id: string;
		kind: 'album' | 'artist' | 'genre' | 'playlist';
	}): void => {
		const album = this.state.albums.find((candidate) => candidate.id === card.id);
		if (!album) return;
		this.setState({ contextMenuCard: { album, kind: 'album' } });
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

	private handleAlbumCardTap = (card: {
		id: string;
		kind: 'album' | 'artist' | 'genre' | 'playlist';
	}): void => {
		const {
			animationsEnabled,
			imageCache,
			navigationController,
			paletteQueue,
			playbackStore,
			transport,
		} = this.viewModel;
		const album = this.state.albums.find((a) => a.id === card.id);
		if (!album) {
			return;
		}

		this.viewModel.onNavigationContext?.({ album, kind: 'album' });
		this.viewModel.onHeaderVisibilityChange?.(false);
		navigationController.push(
			AlbumView,
			{
				album,
				animationsEnabled,
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

	private handleContextMenuAddToPlaylist = (tracks: Array<Track>): void => {
		this.setState({ addToPlaylistTracks: tracks, contextMenuCard: null });
	};

	private handleContextMenuEntityTap = (): void => {
		const card = this.state.contextMenuCard;
		if (!card || card.kind !== 'album') {
			return;
		}
		this.handleContextMenuDismiss();
		this.viewModel.onNavigationContext?.({ album: card.album, kind: 'album' });
		this.viewModel.onHeaderVisibilityChange?.(false);
		const {
			animationsEnabled,
			imageCache,
			navigationController,
			paletteQueue,
			playbackStore,
			transport,
		} = this.viewModel;
		navigationController.push(
			AlbumView,
			{
				album: card.album,
				animationsEnabled,
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

	private handleAddToPlaylistDismiss = (): void => {
		this.setState({ addToPlaylistTracks: null });
	};

	private handleCreatePlaylistCancel = (): void => {
		this.setState({ createPlaylistTracks: null });
		this.pendingCreatePlaylistTracks = null;
	};

	private handleCreatePlaylistRequest = (tracks: Array<Track>): void => {
		this.pendingCreatePlaylistTracks = tracks;
		this.setState({ contextMenuCard: null, createPlaylistTracks: tracks });
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

	private getDisplayAlbums(): Array<Album> {
		const sort = this.viewModel.sortOrder ?? SortOrders.newToOld;
		const letterFilter = this.viewModel.letterFilter;
		const isOffline = this.viewModel.isOfflineMode;

		if (
			this.state.albums === this.cachedDisplayAlbumsRef &&
			sort === this.cachedDisplaySortOrder &&
			letterFilter === this.cachedDisplayLetterFilter &&
			isOffline === this.cachedDisplayIsOffline
		) {
			return this.cachedDisplayAlbums;
		}

		this.cachedDisplayAlbumsRef = this.state.albums;
		this.cachedDisplaySortOrder = sort;
		this.cachedDisplayLetterFilter = letterFilter;
		this.cachedDisplayIsOffline = isOffline;

		let albums = sortAlbumsForView(
			this.state.albums,
			sort,
			shouldUseLocalSortedList(this.viewModel),
		);
		if (letterFilter) {
			albums = albums.filter((a) => matchesLetterFilter(a.name, letterFilter));
		}
		this.cachedDisplayAlbums = albums;
		return albums;
	}

	onRender(): void {
		const {
			imageCache,
			animationsEnabled,
			navigationController,
			paletteQueue,
			playbackStore,
			transport,
		} = this.viewModel;
		const { contextMenuCard, addToPlaylistTracks, createPlaylistTracks, toastMessage } = this.state;
		const createPlaylistFn = transport.createPlaylist?.bind(transport);

		const albums = this.getDisplayAlbums();

		const cards: Array<Card> = albums.map((album) => ({
			artworkKey: album.imageUrl ?? '',
			id: album.id,
			kind: 'album',
			primaryText: album.name,
			secondaryText: album.artistName,
		}));
		<view style={styles.container}>
			<scroll style={createScrollStyle(this.state.isFooterVisible)}>
				<CardGrid
					accessibilityId='library-albums-grid'
					cards={cards}
					columnCount={this.viewModel.gridColumns}
					infiniteScrollTriggerRatio={gridPaginationConfig.nextPageTriggerRatio}
					isLoadingMore={this.state.isLoadingNextPage}
					onCardLongPress={this.handleAlbumCardLongPress}
					onCardTap={this.handleAlbumCardTap}
					onLoadMore={
						this.state.hasMore && !this.state.nextPageFailed ? () => this.loadMore() : undefined
					}
					onRetryLoadMore={this.state.nextPageFailed ? () => this.retryLoadMore() : undefined}
				/>
			</scroll>
			{contextMenuCard && contextMenuCard.kind === 'album' && (
				<CardContextMenu
					animationsEnabled={animationsEnabled}
					card={contextMenuCard}
					imageCache={imageCache}
					onAddToPlaylist={this.handleContextMenuAddToPlaylist}
					onArtistTap={
						contextMenuCard.kind === 'album' && contextMenuCard.album.artistId
							? () => {
									const { album } = contextMenuCard;
									this.handleContextMenuDismiss();
									transport.getArtist(album.artistId).then((artist) => {
										const resolvedArtist = artist ?? {
											id: album.artistId,
											name: album.artistName,
										};
										navigationController.push(
											ArtistView,
											{
												animationsEnabled,
												artist: resolvedArtist,
												downloadService: this.viewModel.downloadService,
												gridColumns: this.viewModel.gridColumns,
												imageCache,
												isHeaderVisible: false,
												modalSlot:
													this.viewModel.navBarContext?.modalSlot ?? this.viewModel.modalSlot,
												navBarContext: this.viewModel.navBarContext,
												onHeaderVisibilityChange: this.viewModel.onHeaderVisibilityChange,
												paletteQueue,
												playbackStore,
												restoreHeaderOnDestroy: false,
												transport,
											},
											{},
											{ animated: animationsEnabled },
										);
									});
								}
							: undefined
					}
					onCreatePlaylist={createPlaylistFn ? this.handleCreatePlaylistRequest : undefined}
					onDismiss={this.handleContextMenuDismiss}
					onEntityTap={this.handleContextMenuEntityTap}
					playbackStore={playbackStore}
					transport={transport}
				/>
			)}
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

function sortAlbumsForView(
	albums: Array<Album>,
	sort: SortOrder,
	shouldSortLocally: boolean,
): Array<Album> {
	if (!shouldSortLocally && sort === SortOrders.aToZ) {
		return albums;
	}
	return sortAlbums(albums, sort);
}

function shouldUseLocalSortedList(viewModel: AlbumsViewModel): boolean {
	if (viewModel.isOfflineMode) {
		return true;
	}
	if (viewModel.letterFilter) {
		return true;
	}

	const transport = viewModel.transport as Transport & Partial<PagedAlbumsTransport>;
	return !transport.getAlbumsPage;
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
