import { StatefulComponent } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';
import type { NavigationController } from 'valdi_navigation/src/NavigationController';
import type { ScrollView, View } from 'valdi_tsx/src/NativeTemplateElements';
import { preloadAtollaImages } from '../../ImageLoaderBootstrap';
import type { Genre } from '../../models/Genre';
import type { Track } from '../../models/Track';
import type { DownloadService } from '../../services/DownloadService';
import type { ImageCache } from '../../services/ImageCache';
import { normalizeImageUrlForCategory } from '../../services/ImageSource';
import type { PlaybackStore } from '../../stores/Playback';
import { scrollPaddingBottom, theme, topInset } from '../../theme';
import type { Transport } from '../../transports/Transport';
import type { CardContextMenuCard } from '../components/CardContextMenu';
import { type Card, CardGrid } from '../components/CardGrid';
import { CreatePlaylistModal } from '../components/CreatePlaylistModal';
import type { ToastService } from '../components/ToastService';
import { openCardContextMenu } from '../flows/cardContextMenuFlow';
import { createPlaylistAndAddTracks } from '../flows/playlistFlow';
import type { NavBarContext } from '../NavBarContext';
import { AddToPlaylistView } from './AddToPlaylistView';
import { bindFooterVisibility } from './footerVisibility';
import { GenreView } from './GenreView';
import { gridPaginationConfig } from './GridPagination';
import type { LibraryNavContext } from './LibraryView';
import { createPagedGridController } from './pagination/createPagedGridController';

interface GenresViewModel {
	animationsEnabled: boolean;
	downloadService: DownloadService;
	gridColumns: number;
	imageCache: ImageCache;
	letterFilter?: string | null;
	modalSlot?: DetachedSlot;
	navBarContext?: NavBarContext;
	navigationController: NavigationController;
	onHeaderVisibilityChange?: (isVisible: boolean) => void;
	onNavigateToArtist?: (artistId: string) => void;
	onNavigationContext?: (context: LibraryNavContext | null) => void;
	playbackStore: PlaybackStore;
	toastService: ToastService;
	transport: Transport;
}

interface GenresState {
	addToPlaylistTracks: Array<Track> | null;
	contextMenuCard: CardContextMenuCard | null;
	createPlaylistTracks: Array<Track> | null;
	genres: Array<Genre>;
	hasMore: boolean;
	isFooterVisible: boolean;
	isLoadingNextPage: boolean;
	nextPageFailed: boolean;
	page: number;
}

export class GenresView extends StatefulComponent<GenresViewModel, GenresState> {
	private readonly pagedGridController = createPagedGridController<Genre>({
		fetchPage: (page) =>
			this.viewModel.transport.getGenresPage(page, gridPaginationConfig.pageSize),
		isDestroyed: () => this.isDestroyed(),
		onPageLoaded: (items) => this.preloadGenreImages(items),
		setState: (patch) => {
			this.setState({
				genres: patch.items ?? this.state.genres,
				hasMore: patch.hasMore ?? this.state.hasMore,
				isLoadingNextPage: patch.isLoadingNextPage ?? this.state.isLoadingNextPage,
				nextPageFailed: patch.nextPageFailed ?? this.state.nextPageFailed,
				page: patch.page ?? this.state.page,
			});
		},
	});
	private pendingCreatePlaylistTracks: Array<Track> | null = null;

	state: GenresState = {
		addToPlaylistTracks: null,
		contextMenuCard: null,
		createPlaylistTracks: null,
		genres: [],
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

	private async loadInitialPages(): Promise<void> {
		await this.pagedGridController.loadNextPage();
	}

	private preloadGenreImages(items: Array<Genre>): void {
		try {
			preloadAtollaImages(
				items
					.map((g) => g.imageUrl)
					.filter((url): url is string => url != null)
					.map((url) => normalizeImageUrlForCategory(url, 'genre_art')),
				'genre_art',
			);
		} catch {
			// Non-Android targets do not provide native preload bridge.
		}
	}

	retryLoadMore(): void {
		void this.pagedGridController.loadNextPage();
	}

	loadMore(): void {
		void this.pagedGridController.loadNextPage();
	}

	handleGenreCardLongPress = (card: {
		id: string;
		kind: 'album' | 'artist' | 'genre' | 'playlist';
	}): void => {
		const genre = this.state.genres.find((candidate) => candidate.id === card.id);
		if (!genre) return;
		this.setState({ contextMenuCard: { genre, kind: 'genre' } });
		openCardContextMenu(this.viewModel.navBarContext?.modalSlot ?? this.viewModel.modalSlot, {
			animationsEnabled: this.viewModel.animationsEnabled,
			card: { genre, kind: 'genre' },
			onAddToPlaylist: this.handleContextMenuAddToPlaylist,
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

	private navigateToGenre = (genre: Genre): void => {
		const { animationsEnabled, imageCache, navigationController, playbackStore, transport } =
			this.viewModel;
		this.viewModel.onNavigationContext?.({ genre, kind: 'genre' });
		this.viewModel.onHeaderVisibilityChange?.(false);
		navigationController.push(
			GenreView,
			{
				animationsEnabled,
				downloadService: this.viewModel.downloadService,
				genre,
				gridColumns: this.viewModel.gridColumns,
				imageCache,
				modalSlot: this.viewModel.navBarContext?.modalSlot ?? this.viewModel.modalSlot,
				navBarContext: this.viewModel.navBarContext,
				onHeaderVisibilityChange: this.viewModel.onHeaderVisibilityChange,
				onNavigateToArtist: this.viewModel.onNavigateToArtist,
				playbackStore,
				toastService: this.viewModel.toastService,
				transport,
			},
			{},
			{ animated: animationsEnabled },
		);
	};

	private handleGenreCardTap = (card: {
		id: string;
		kind: 'album' | 'artist' | 'genre' | 'playlist';
	}): void => {
		const genre = this.state.genres.find((candidate) => candidate.id === card.id);
		if (!genre) return;
		this.navigateToGenre(genre);
	};

	private handleContextMenuAddToPlaylist = (tracks: Array<Track>): void => {
		this.setState({ addToPlaylistTracks: tracks, contextMenuCard: null });
	};

	private handleContextMenuEntityTap = (): void => {
		const card = this.state.contextMenuCard;
		if (!card || card.kind !== 'genre') return;
		this.navigateToGenre(card.genre);
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

	onRender(): void {
		const { animationsEnabled, imageCache, toastService, transport } = this.viewModel;
		const { addToPlaylistTracks, createPlaylistTracks } = this.state;
		let genres = this.state.genres;
		if (this.viewModel.letterFilter) {
			const letter = this.viewModel.letterFilter;
			genres = genres.filter((g) =>
				letter === '0'
					? /^\d/.test(g.name.trim())
					: g.name.trim().toLowerCase().startsWith(letter.toLowerCase()),
			);
		}

		const cards: Array<Card> = genres.map((genre) => ({
			artworkKey: genre.imageUrl ?? '',
			id: genre.id,
			kind: 'genre',
			primaryText: genre.name,
			secondaryText: genre.trackCount != null ? `${genre.trackCount} tracks` : '',
		}));

		<view style={styles.container}>
			<scroll style={createScrollStyle(this.state.isFooterVisible)}>
				<CardGrid
					accessibilityId='library-genres-grid'
					cards={cards}
					columnCount={this.viewModel.gridColumns}
					infiniteScrollTriggerRatio={gridPaginationConfig.nextPageTriggerRatio}
					isLoadingMore={this.state.isLoadingNextPage}
					onCardLongPress={this.handleGenreCardLongPress}
					onCardTap={this.handleGenreCardTap}
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
