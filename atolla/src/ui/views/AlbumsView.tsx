import { StatefulComponent } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';
import type { NavigationController } from 'valdi_navigation/src/NavigationController';
import type { ScrollView, View } from 'valdi_tsx/src/NativeTemplateElements';
import { preloadAtollaImages } from '../../ImageLoaderBootstrap';
import type { Album } from '../../models/Album';
import Strings from '../../Strings';
import type { DownloadService } from '../../services/DownloadService';
import type { ImageCache } from '../../services/ImageCache';
import { normalizeImageUrlForCategory } from '../../services/ImageSource';
import type { PaletteGenerationQueue } from '../../services/PaletteGenerationQueue';
import type { ToastService } from '../../services/ToastService';
import type { TrackSource } from '../../services/TrackSource';
import type { PlaybackStore } from '../../stores/Playback';
import type { Preferences } from '../../stores/Preferences';
import { theme } from '../../theme';
import type { Transport } from '../../transports/Transport';
import type { CardContextMenuCard } from '../components/CardContextMenu';
import { type Card, CardGrid } from '../components/CardGrid';
import { CreatePlaylistModal } from '../components/CreatePlaylistModal';
import { EmptyState } from '../components/EmptyState';
import { type SortOrder, SortOrders } from '../components/SortNavPanel';
import { openCardContextMenu } from '../flows/CardContextMenu';
import { createPlaylistAndAddTracks } from '../flows/CreatePlaylist';
import { type DetailPushDeps, pushAlbum, pushArtist } from '../flows/PushDetail';
import { createPagedGridController, gridPaginationConfig } from '../pagination/Grid';
import { AddToPlaylistView } from './AddToPlaylistView';
import { sortAlbums } from './sort/Albums';

export interface AlbumsViewModel {
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
}

interface AlbumsState {
	addToPlaylistTracks: TrackSource | null;
	albums: Array<Album>;
	contextMenuCard: CardContextMenuCard | null;
	createPlaylistTracks: TrackSource | null;
	hasMore: boolean;
	isLoadingNextPage: boolean;
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
		nextPageFailed: false,
		page: 0,
		revision: 0,
	};

	onCreate(): void {
		this.registerDisposable(this.viewModel.preferences.subscribe(this.bump));
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

	onRender(): void {
		const { imageCache, toastService, transport } = this.viewModel;
		const { animationsEnabled, gridColumns } = this.viewModel.preferences;
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
			<scroll style={styles.scroll}>
				<CardGrid
					accessibilityId='library-albums-grid'
					cards={cards}
					columnCount={gridColumns}
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
			playbackStore: this.viewModel.playbackStore,
			transport: this.viewModel.transport,
		});
	};

	retryLoadMore(): void {
		void this.pagedGridController.loadNextPage();
	}

	private bump = (): void => {
		this.setState({ revision: this.state.revision + 1 });
	};

	private cachedDisplayAlbums: Array<Album> = [];
	private cachedDisplayAlbumsRef: Array<Album> | null = null;
	private cachedDisplaySortOrder: SortOrder | undefined = undefined;
	private cachedDisplayLetterFilter: string | null | undefined = undefined;
	private cachedDisplayIsOffline = false;
	private pendingCreatePlaylistTracks: TrackSource | null = null;

	private async loadInitialPages(): Promise<void> {
		await this.pagedGridController.loadNextPage();
	}

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
			// non-Android targets have no native preload bridge
		}
	}

	private fetchPage(page: number): Promise<AlbumPageResult> {
		return Promise.resolve(
			this.viewModel.transport.getAlbums(page, gridPaginationConfig.pageSize, {
				startsWith: this.viewModel.letterFilter ?? undefined,
			}),
		);
	}

	private handleAddToPlaylistDismiss = (): void => {
		this.setState({ addToPlaylistTracks: null });
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

	private handleContextMenuDismiss = (toastMessage?: string): void => {
		this.setState({ contextMenuCard: null });
		if (toastMessage) {
			this.viewModel.toastService.show(toastMessage);
		}
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

		await createPlaylistAndAddTracks(
			name,
			(playlistName) => this.viewModel.transport.createPlaylist(playlistName),
			(playlistId, trackIds) => this.viewModel.transport.addItemsToPlaylist(playlistId, trackIds),
			tracks,
			{ isCancelled: () => this.isDestroyed() },
		);
		this.pendingCreatePlaylistTracks = null;
		this.setState({ createPlaylistTracks: null });
	};

	private handleCreatePlaylistRequest = (tracks: TrackSource): void => {
		this.pendingCreatePlaylistTracks = tracks;
		this.setState({ contextMenuCard: null, createPlaylistTracks: tracks });
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

	private loadMore(): void {
		void this.pagedGridController.loadNextPage();
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
