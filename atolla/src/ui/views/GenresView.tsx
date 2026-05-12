import { StatefulComponent } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';
import type { NavigationController } from 'valdi_navigation/src/NavigationController';
import type { ScrollView } from 'valdi_tsx/src/NativeTemplateElements';
import { preloadAtollaImages } from '../../ImageLoaderBootstrap';
import type { Genre } from '../../models/Genre';
import type { DownloadService } from '../../services/DownloadService';
import type { ImageCache } from '../../services/ImageCache';
import { normalizeImageUrlForCategory } from '../../services/ImageSource';
import type { PlaybackStore } from '../../stores/Playback';
import { scrollPaddingBottom, theme, topInset } from '../../theme';
import type { Transport } from '../../transports/Transport';
import { type Card, CardGrid } from '../components/CardGrid';
import type { NavBarContext } from '../NavBarContext';
import { GenreView } from './GenreView';
import { gridPaginationConfig } from './GridPagination';
import type { LibraryNavContext } from './LibraryView';

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
	transport: Transport;
}

interface GenresState {
	genres: Array<Genre>;
	hasMore: boolean;
	isFooterVisible: boolean;
	isLoadingNextPage: boolean;
	nextPageFailed: boolean;
	page: number;
}

export class GenresView extends StatefulComponent<GenresViewModel, GenresState> {
	private currentPage = 0;
	private hasBeenDestroyed = false;
	private isLoadingPage = false;
	private unsubscribePlayback?: () => void;

	state: GenresState = {
		genres: [],
		hasMore: true,
		isFooterVisible: false,
		isLoadingNextPage: false,
		nextPageFailed: false,
		page: 0,
	};

	onCreate(): void {
		this.hasBeenDestroyed = false;
		this.unsubscribePlayback = this.viewModel.playbackStore.subscribe(() => {
			const isFooterVisible = this.viewModel.playbackStore.track !== null;
			if (isFooterVisible !== this.state.isFooterVisible) {
				this.setState({ isFooterVisible });
			}
		});

		const isFooterVisible = this.viewModel.playbackStore.track !== null;
		if (isFooterVisible !== this.state.isFooterVisible) {
			this.setState({ isFooterVisible });
		}

		void this.loadInitialPages();
	}

	onDestroy(): void {
		this.hasBeenDestroyed = true;
		this.unsubscribePlayback?.();
	}

	private async loadInitialPages(): Promise<void> {
		await this.loadNextPage();
	}

	private async loadNextPage(): Promise<void> {
		if (this.hasBeenDestroyed || this.isLoadingPage || !this.state.hasMore) {
			return;
		}

		const nextPage = this.currentPage + 1;
		const isFirstPage = nextPage === 1;
		this.isLoadingPage = true;
		if (!isFirstPage) {
			this.setState({ isLoadingNextPage: true, nextPageFailed: false });
		}

		try {
			const page = await this.viewModel.transport.getGenresPage(
				nextPage,
				gridPaginationConfig.pageSize,
			);
			if (this.hasBeenDestroyed) {
				return;
			}

			const genres = isFirstPage ? page.items : [...this.state.genres, ...page.items];
			this.currentPage = nextPage;
			this.isLoadingPage = false;
			try {
				preloadAtollaImages(
					page.items
						.map((g) => g.imageUrl)
						.filter((url): url is string => url != null)
						.map((url) => normalizeImageUrlForCategory(url, 'genre_art')),
					'genre_art',
				);
			} catch {
				// Non-Android targets do not provide native preload bridge.
			}
			this.setState({
				genres,
				hasMore: page.hasMore,
				isLoadingNextPage: false,
				nextPageFailed: false,
				page: nextPage,
			});
		} catch {
			if (this.hasBeenDestroyed) {
				return;
			}

			this.isLoadingPage = false;
			this.setState({ isLoadingNextPage: false, nextPageFailed: true });
		}
	}

	retryLoadMore(): void {
		void this.loadNextPage();
	}

	loadMore(): void {
		void this.loadNextPage();
	}

	onRender(): void {
		const { animationsEnabled, imageCache, navigationController, playbackStore, transport } =
			this.viewModel;
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

		<scroll style={createScrollStyle(this.state.isFooterVisible)}>
			<CardGrid
				accessibilityId='library-genres-grid'
				cards={cards}
				columnCount={this.viewModel.gridColumns}
				infiniteScrollTriggerRatio={gridPaginationConfig.nextPageTriggerRatio}
				isLoadingMore={this.state.isLoadingNextPage}
				onCardTap={(card) => {
					const genre = this.state.genres.find((candidate) => candidate.id === card.id);
					if (!genre) {
						return;
					}

					this.viewModel.onNavigationContext?.({ genre, kind: 'genre' });
					this.viewModel.onHeaderVisibilityChange?.(false);
					navigationController.push(
						GenreView,
						{
							animationsEnabled,
							downloadService: this.viewModel.downloadService,
							genre,
							imageCache,
							modalSlot: this.viewModel.navBarContext?.modalSlot ?? this.viewModel.modalSlot,
							navBarContext: this.viewModel.navBarContext,
							onHeaderVisibilityChange: this.viewModel.onHeaderVisibilityChange,
							onNavigateToArtist: this.viewModel.onNavigateToArtist,
							playbackStore,
							transport,
						},
						{},
						{ animated: animationsEnabled },
					);
				}}
				onLoadMore={
					this.state.hasMore && !this.state.nextPageFailed ? () => this.loadMore() : undefined
				}
				onRetryLoadMore={this.state.nextPageFailed ? () => this.retryLoadMore() : undefined}
			/>
		</scroll>;
	}
}

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
