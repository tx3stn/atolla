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
import type { ToastService } from '../../services/ToastService';
import type { PlaybackStore } from '../../stores/Playback';
import { scrollPaddingBottom, theme, topInset } from '../../theme';
import type { Transport } from '../../transports/Transport';
import type { CardContextMenuCard } from '../components/CardContextMenu';
import { type Card, CardGrid } from '../components/CardGrid';
import { CreatePlaylistModal } from '../components/CreatePlaylistModal';
import { type SortOrder, SortOrders } from '../components/SortNavPanel';
import { openCardContextMenu } from '../flows/CardContextMenu';
import { createPlaylistAndAddTracks } from '../flows/CreatePlaylist';
import type { NavBarContext } from '../NavBarContext';
import { createPagedGridController, gridPaginationConfig } from '../pagination/Grid';
import { AddToPlaylistView } from './AddToPlaylistView';
import { ArtistView } from './ArtistView';
import { bindFooterVisibility } from './footerVisibility';
import type { LibraryNavContext } from './LibraryView';
import { sortArtists } from './sort/Artists';

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
	toastService: ToastService;
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
}

interface ArtistPageResult {
	hasMore: boolean;
	items: Array<Artist>;
}

export class ArtistsView extends StatefulComponent<ArtistsViewModel, ArtistsState> {
	private readonly pagedGridController = createPagedGridController<Artist>({
		fetchPage: (page) => this.fetchPage(page),
		isDestroyed: () => this.isDestroyed(),
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
		return this.viewModel.transport.getArtistsPage(page, gridPaginationConfig.pageSize, {
			startsWith: this.viewModel.letterFilter ?? undefined,
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
			onAddToPlaylist: this.handleContextMenuAddToPlaylist,
			onArtistTap: this.handleContextMenuArtistTap,
			onCreatePlaylist: this.handleCreatePlaylistRequest,
			onDismiss: this.handleContextMenuDismiss,
			onEntityTap: this.handleContextMenuEntityTap,
			playbackStore: this.viewModel.playbackStore,
			transport: this.viewModel.transport,
		});
	};

	handleContextMenuDismiss = (toastMessage?: string): void => {
		this.setState({ contextMenuCard: null });
		if (toastMessage) {
			this.viewModel.toastService.show(toastMessage);
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
				toastService: this.viewModel.toastService,
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
		if (card?.kind !== 'artist') return;
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
		const tracks = this.pendingCreatePlaylistTracks;
		if (!tracks) return;
		await createPlaylistAndAddTracks(
			name,
			this.viewModel.transport.createPlaylist.bind(this.viewModel.transport),
			this.viewModel.transport.addItemToPlaylist.bind(this.viewModel.transport),
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

		let artists = sortArtistsForView(this.state.artists, sort, this.viewModel.isOfflineMode);
		if (letterFilter) {
			artists = artists.filter((a) => matchesArtistLetterFilter(a.name, letterFilter));
		}
		this.cachedDisplayArtists = artists;
		return artists;
	}

	onRender(): void {
		const { imageCache, animationsEnabled, toastService, transport } = this.viewModel;
		const { addToPlaylistTracks, createPlaylistTracks } = this.state;

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
