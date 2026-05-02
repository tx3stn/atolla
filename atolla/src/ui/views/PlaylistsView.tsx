import { StatefulComponent } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { NavigationController } from 'valdi_navigation/src/NavigationController';
import type { ScrollView } from 'valdi_tsx/src/NativeTemplateElements';
import { preloadAtollaImages } from '../../ImageLoaderBootstrap';
import type { Playlist } from '../../models/Playlist';
import type { DownloadService } from '../../services/DownloadService';
import type { ImageCache } from '../../services/ImageCache';
import { normalizeImageUrlForCategory } from '../../services/ImageSource';
import type { PaletteGenerationQueue } from '../../services/PaletteGenerationQueue';
import type { PlaybackStore } from '../../stores/Playback';
import { scrollPaddingBottom, theme, topInset } from '../../theme';
import type { Transport } from '../../transports/Transport';
import { type Card, CardGrid } from '../components/CardGrid';
import { type SortOrder, SortOrders } from '../components/SortNavPanel';
import type { NavBarContext } from '../NavBarContext';
import { gridPaginationConfig } from './GridPagination';
import type { LibraryNavContext } from './LibraryView';
import { sortPlaylists } from './PlaylistsSort';
import { PlaylistView } from './PlaylistView';

export interface PlaylistsViewModel {
	animationsEnabled: boolean;
	downloadService: DownloadService;
	gridColumns: number;
	imageCache: ImageCache;
	letterFilter?: string | null;
	navBarContext?: NavBarContext;
	navigationController: NavigationController;
	onHeaderVisibilityChange?: (isVisible: boolean) => void;
	onNavigateToArtist?: (artistId: string) => void;
	onNavigationContext?: (context: LibraryNavContext | null) => void;
	paletteQueue?: PaletteGenerationQueue;
	playbackStore: PlaybackStore;
	sortOrder?: SortOrder;
	transport: Transport;
}

interface PlaylistsState {
	hasMore: boolean;
	isFooterVisible: boolean;
	isLoadingNextPage: boolean;
	nextPageFailed: boolean;
	page: number;
	playlists: Array<Playlist>;
}

interface PlaylistPageResult {
	hasMore: boolean;
	items: Array<Playlist>;
}

interface PagedPlaylistsTransport {
	getPlaylistsPage: (page: number, pageSize: number) => Promise<PlaylistPageResult>;
}

export class PlaylistsView extends StatefulComponent<PlaylistsViewModel, PlaylistsState> {
	private allPlaylists: Array<Playlist> | null = null;
	private currentPage = 0;
	private hasBeenDestroyed = false;
	private isLoadingPage = false;
	private unsubscribePlayback?: () => void;

	state: PlaylistsState = {
		hasMore: true,
		isFooterVisible: false,
		isLoadingNextPage: false,
		nextPageFailed: false,
		page: 0,
		playlists: [],
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

	onViewModelUpdate(prevViewModel?: PlaylistsViewModel): void {
		if (!prevViewModel) {
			return;
		}
		if (this.viewModel.letterFilter === prevViewModel.letterFilter) {
			return;
		}

		this.allPlaylists = null;
		this.currentPage = 0;
		this.isLoadingPage = false;
		this.setState({
			hasMore: true,
			isLoadingNextPage: false,
			nextPageFailed: false,
			page: 0,
			playlists: [],
		});
		void this.loadInitialPages();
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
			const page = await this.fetchPage(nextPage);
			if (this.hasBeenDestroyed) {
				return;
			}

			const playlists = isFirstPage ? page.items : [...this.state.playlists, ...page.items];
			this.currentPage = nextPage;
			this.isLoadingPage = false;
			try {
				preloadAtollaImages(
					page.items
						.map((p) => p.imageUrl)
						.filter((url): url is string => url != null)
						.map((url) => normalizeImageUrlForCategory(url, 'playlist_image_thumb')),
					'playlist_image_thumb',
				);
			} catch {
				// Non-Android targets do not provide native preload bridge.
			}
			this.setState({
				hasMore: page.hasMore,
				isLoadingNextPage: false,
				nextPageFailed: false,
				page: nextPage,
				playlists,
			});
		} catch {
			if (this.hasBeenDestroyed) {
				return;
			}

			this.isLoadingPage = false;
			this.setState({ isLoadingNextPage: false, nextPageFailed: true });
		}
	}

	private fetchPage(page: number): Promise<PlaylistPageResult> {
		const sort = this.viewModel.sortOrder ?? SortOrders.aToZ;
		const transport = this.viewModel.transport as Transport & Partial<PagedPlaylistsTransport>;

		if (!!this.viewModel.letterFilter || !transport.getPlaylistsPage) {
			if (!this.allPlaylists) {
				return this.viewModel.transport.getAllPlaylists().then((playlists) => {
					this.allPlaylists = sortPlaylists(playlists, sort);
					return { hasMore: false, items: this.allPlaylists };
				});
			}
			this.allPlaylists = sortPlaylists(this.allPlaylists, sort);
			return Promise.resolve({ hasMore: false, items: this.allPlaylists });
		}

		return transport.getPlaylistsPage(page, gridPaginationConfig.pageSize);
	}

	retryLoadMore(): void {
		void this.loadNextPage();
	}

	loadMore(): void {
		void this.loadNextPage();
	}

	handlePlaylistCardLongPress = (card: {
		id: string;
		kind: 'album' | 'artist' | 'genre' | 'playlist';
	}): void => {
		const playlist = this.state.playlists.find((candidate) => candidate.id === card.id);
		if (!playlist) {
			return;
		}

		this.viewModel.transport.getTracksByPlaylist(playlist.id).then(async (tracks) => {
			if (tracks.length === 0) {
				return;
			}

			const artistLogoUrls = await Promise.all(
				tracks.map((track) =>
					track.artistId ? this.viewModel.transport.getArtistLogoUrl(track.artistId) : null,
				),
			);
			this.viewModel.playbackStore.playWithArtistLogos(tracks, artistLogoUrls);
		});
	};

	onRender(): void {
		const {
			animationsEnabled,
			imageCache,
			navigationController,
			onNavigateToArtist,
			paletteQueue,
			playbackStore,
			transport,
		} = this.viewModel;

		const sort = this.viewModel.sortOrder ?? SortOrders.aToZ;
		let playlists = sortPlaylists(this.state.playlists, sort);
		if (this.viewModel.letterFilter) {
			const letter = this.viewModel.letterFilter;
			playlists = playlists.filter((p) => matchesLetterFilter(p.name, letter));
		}

		const cards: Array<Card> = playlists.map((playlist) => ({
			artworkKey: playlist.imageUrl ?? '',
			id: playlist.id,
			kind: 'playlist',
			primaryText: playlist.name,
			secondaryText: '',
		}));
		<scroll style={createScrollStyle(this.state.isFooterVisible)}>
			<CardGrid
				accessibilityLabel='library-playlists-grid'
				cards={cards}
				columnCount={this.viewModel.gridColumns}
				infiniteScrollTriggerRatio={gridPaginationConfig.nextPageTriggerRatio}
				isLoadingMore={this.state.isLoadingNextPage}
				onCardLongPress={this.handlePlaylistCardLongPress}
				onCardTap={(card) => {
					const playlist = this.state.playlists.find((p) => p.id === card.id);
					if (playlist) {
						this.viewModel.onNavigationContext?.({ kind: 'playlist', playlist });
						this.viewModel.onHeaderVisibilityChange?.(false);
						navigationController.push(
							PlaylistView,
							{
								animationsEnabled,
								downloadService: this.viewModel.downloadService,
								gridColumns: this.viewModel.gridColumns,
								imageCache,
								navBarContext: this.viewModel.navBarContext,
								onHeaderVisibilityChange: this.viewModel.onHeaderVisibilityChange,
								onNavigateToArtist,
								onNavigationContext: this.viewModel.onNavigationContext,
								paletteQueue,
								playbackStore,
								playlist,
								transport,
							},
							{},
							{ animated: animationsEnabled },
						);
					}
				}}
				onLoadMore={
					this.state.hasMore && !this.state.nextPageFailed ? () => this.loadMore() : undefined
				}
				onRetryLoadMore={this.state.nextPageFailed ? () => this.retryLoadMore() : undefined}
			/>
		</scroll>;
	}
}

function matchesLetterFilter(name: string, letter: string): boolean {
	if (letter === '0') {
		return /^\d/.test(name.trim());
	}
	return name.trim().toLowerCase().startsWith(letter.toLowerCase());
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
