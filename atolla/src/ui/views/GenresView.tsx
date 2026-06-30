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
import type { ToastService } from '../../services/ToastService';
import type { PlaybackStore } from '../../stores/Playback';
import { theme } from '../../theme';
import type { Transport } from '../../transports/Transport';
import type { CardContextMenuCard } from '../components/CardContextMenu';
import { type Card, CardGrid } from '../components/CardGrid';
import { CreatePlaylistModal } from '../components/CreatePlaylistModal';
import { openCardContextMenu } from '../flows/CardContextMenu';
import { createPlaylistAndAddTracks } from '../flows/CreatePlaylist';
import { createPagedGridController, gridPaginationConfig } from '../pagination/Grid';
import { AddToPlaylistView } from './AddToPlaylistView';
import { GenreView } from './GenreView';

interface GenresViewModel {
	animationsEnabled: boolean;
	downloadService: DownloadService;
	gridColumns: number;
	imageCache: ImageCache;
	letterFilter?: string | null;
	modalSlot: DetachedSlot;
	navigationController: NavigationController;
	onNavigateToArtist?: (artistId: string) => void;
	onRootDetailControllerReady: (controller: NavigationController) => void;
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
	isLoadingNextPage: boolean;
	nextPageFailed: boolean;
	page: number;
}

export class GenresView extends StatefulComponent<GenresViewModel, GenresState> {
	private pendingCreatePlaylistTracks: Array<Track> | null = null;

	state: GenresState = {
		addToPlaylistTracks: null,
		contextMenuCard: null,
		createPlaylistTracks: null,
		genres: [],
		hasMore: true,
		isLoadingNextPage: false,
		nextPageFailed: false,
		page: 0,
	};

	onCreate(): void {
		void this.loadInitialPages();
	}

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
			<scroll style={styles.scroll}>
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
					animationsEnabled={animationsEnabled}
					onCancel={this.handleCreatePlaylistCancel}
					onCreate={this.handleCreatePlaylistConfirm}
				/>
			)}
		</view>;
	}

	private handleAddToPlaylistDismiss = (): void => {
		this.setState({ addToPlaylistTracks: null });
	};

	private handleContextMenuAddToPlaylist = (tracks: Array<Track>): void => {
		this.setState({ addToPlaylistTracks: tracks, contextMenuCard: null });
	};

	private handleContextMenuDismiss = (toastMessage?: string): void => {
		this.setState({ contextMenuCard: null });
		if (toastMessage) {
			this.viewModel.toastService.show(toastMessage);
		}
	};

	private handleContextMenuEntityTap = (): void => {
		const card = this.state.contextMenuCard;
		if (card?.kind !== 'genre') return;
		this.navigateToGenre(card.genre);
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

	private handleCreatePlaylistRequest = (tracks: Array<Track>): void => {
		this.pendingCreatePlaylistTracks = tracks;
		this.setState({ contextMenuCard: null, createPlaylistTracks: tracks });
	};

	private handleGenreCardTap = (card: {
		id: string;
		kind: 'album' | 'artist' | 'genre' | 'playlist';
	}): void => {
		const genre = this.state.genres.find((candidate) => candidate.id === card.id);
		if (!genre) return;
		this.navigateToGenre(genre);
	};

	private handleGenreCardLongPress = (card: {
		id: string;
		kind: 'album' | 'artist' | 'genre' | 'playlist';
	}): void => {
		const genre = this.state.genres.find((candidate) => candidate.id === card.id);
		if (!genre) return;
		this.setState({ contextMenuCard: { genre, kind: 'genre' } });
		openCardContextMenu(this.viewModel.modalSlot, {
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

	private async loadInitialPages(): Promise<void> {
		await this.pagedGridController.loadNextPage();
	}

	private loadMore(): void {
		void this.pagedGridController.loadNextPage();
	}

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
			// non-Android targets have no native preload bridge
		}
	}

	private navigateToGenre = (genre: Genre): void => {
		const {
			animationsEnabled,
			imageCache,
			modalSlot,
			navigationController,
			playbackStore,
			transport,
		} = this.viewModel;
		navigationController.push(
			GenreView,
			{
				animationsEnabled,
				downloadService: this.viewModel.downloadService,
				genre,
				gridColumns: this.viewModel.gridColumns,
				imageCache,
				modalSlot: modalSlot,
				navigationController,
				onNavigateToArtist: this.viewModel.onNavigateToArtist,
				onRootDetailControllerReady: this.viewModel.onRootDetailControllerReady,
				playbackStore,
				toastService: this.viewModel.toastService,
				transport,
			},
			{},
			{ animated: animationsEnabled },
		);
	};

	private retryLoadMore(): void {
		void this.pagedGridController.loadNextPage();
	}
}

const styles = {
	container: new Style<View>({
		flexGrow: 1,
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
