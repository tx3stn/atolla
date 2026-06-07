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
import type { CardContextMenuCard } from '../components/CardContextMenu';
import { type Card, CardGrid } from '../components/CardGrid';
import { CreatePlaylistModal } from '../components/CreatePlaylistModal';
import { type SortOrder, SortOrders } from '../components/SortNavPanel';
import type { ToastService } from '../components/ToastService';
import { openCardContextMenu } from '../flows/cardContextMenuFlow';
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
	toastService: ToastService;
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
}

interface AlbumPageResult {
	hasMore: boolean;
	items: Array<Album>;
}

export class AlbumsView extends StatefulComponent<AlbumsViewModel, AlbumsState> {
	private readonly pagedGridController = createPagedGridController<Album>({
		fetchPage: (page) => this.fetchPage(page),
		isDestroyed: () => this.isDestroyed(),
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
	};

	onCreate(): void {
		this.registerDisposable(
			bindFooterVisibility({
				getIsFooterVisible: () => this.state.isFooterVisible,
				playbackStore: this.viewModel.playbackStore,
				setIsFooterVisible: (isFooterVisible) => {
					this.setState({ isFooterVisible });
				},
			}),
		);
		void this.loadInitialPages();
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
		return this.viewModel.transport.getAlbumsPage(page, gridPaginationConfig.pageSize, {
			startsWith: this.viewModel.letterFilter ?? undefined,
		});
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
		const {
			animationsEnabled,
			imageCache,
			navigationController,
			paletteQueue,
			playbackStore,
			transport,
		} = this.viewModel;
		openCardContextMenu(this.viewModel.navBarContext?.modalSlot ?? this.viewModel.modalSlot, {
			animationsEnabled,
			card: { album, kind: 'album' },
			onAddToPlaylist: this.handleContextMenuAddToPlaylist,
			onArtistTap: album.artistId
				? () => {
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
									modalSlot: this.viewModel.navBarContext?.modalSlot ?? this.viewModel.modalSlot,
									navBarContext: this.viewModel.navBarContext,
									onHeaderVisibilityChange: this.viewModel.onHeaderVisibilityChange,
									paletteQueue,
									playbackStore,
									restoreHeaderOnDestroy: false,
									toastService: this.viewModel.toastService,
									transport,
								},
								{},
								{ animated: animationsEnabled },
							);
						});
					}
				: undefined,
			onCreatePlaylist: this.handleCreatePlaylistRequest,
			onDismiss: this.handleContextMenuDismiss,
			onEntityTap: this.handleContextMenuEntityTap,
			playbackStore,
			transport,
		});
	};

	handleContextMenuDismiss = (toastMessage?: string): void => {
		this.setState({ contextMenuCard: null });
		if (toastMessage) {
			this.viewModel.toastService.show(toastMessage);
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
				toastService: this.viewModel.toastService,
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
		if (card?.kind !== 'album') {
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
				toastService: this.viewModel.toastService,
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

		let albums = sortAlbumsForView(this.state.albums, sort, this.viewModel.isOfflineMode);
		if (letterFilter) {
			albums = albums.filter((a) => matchesLetterFilter(a.name, letterFilter));
		}
		this.cachedDisplayAlbums = albums;
		return albums;
	}

	onRender(): void {
		const { imageCache, animationsEnabled, toastService, transport } = this.viewModel;
		const { addToPlaylistTracks, createPlaylistTracks } = this.state;

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
					onCancel={this.handleCreatePlaylistCancel}
					onCreate={this.handleCreatePlaylistConfirm}
				/>
			)}
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
