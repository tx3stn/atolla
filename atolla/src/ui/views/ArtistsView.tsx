// @ts-nocheck

import { StatefulComponent } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { NavigationController } from 'valdi_navigation/src/NavigationController';
import type { Artist } from '../../models/Artist';
import type { ImageCache } from '../../services/ImageCache';
import type { PaletteGenerationQueue } from '../../services/PaletteGenerationQueue';
import type { PlaybackStore } from '../../stores/Playback';
import { scrollPaddingBottom, theme } from '../../theme';
import type { Transport } from '../../transports/Transport';
import { type Card, CardGrid } from '../components/CardGrid';
import { ArtistView } from './ArtistView';
import { gridPaginationConfig } from './GridPagination';

export interface ArtistsViewModel {
	animationsEnabled: boolean;
	gridColumns: number;
	imageCache: ImageCache;
	navigationController: NavigationController;
	paletteQueue?: PaletteGenerationQueue;
	playbackStore: PlaybackStore;
	transport: Transport;
}

interface ArtistsState {
	artists: Array<Artist>;
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

interface PagedArtistsTransport {
	getArtistsPage: (page: number, pageSize: number) => Promise<ArtistPageResult>;
}

export class ArtistsView extends StatefulComponent<ArtistsViewModel, ArtistsState> {
	private allArtists: Array<Artist> | null = null;
	private currentPage = 0;
	private hasBeenDestroyed = false;
	private isLoadingPage = false;
	private unsubscribePlayback?: () => void;

	state: ArtistsState = {
		artists: [],
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
			const page = await this.fetchPage(nextPage);
			if (this.hasBeenDestroyed) {
				return;
			}

			const artists = isFirstPage ? page.items : [...this.state.artists, ...page.items];
			this.currentPage = nextPage;
			this.isLoadingPage = false;
			void this.viewModel.imageCache.prefetch(
				page.items.map((a) => a.imageUrl).filter((url): url is string => url != null),
				'artist_image',
			);
			this.setState({
				artists,
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

	private fetchPage(page: number): Promise<ArtistPageResult> {
		const transport = this.viewModel.transport as Transport & Partial<PagedArtistsTransport>;
		if (transport.getArtistsPage) {
			return transport.getArtistsPage(page, gridPaginationConfig.pageSize);
		}

		if (!this.allArtists) {
			return this.viewModel.transport.getAllArtists().then((artists) => {
				this.allArtists = artists;
				const start = (page - 1) * gridPaginationConfig.pageSize;
				const end = start + gridPaginationConfig.pageSize;
				return { hasMore: end < this.allArtists.length, items: this.allArtists.slice(start, end) };
			});
		}

		const start = (page - 1) * gridPaginationConfig.pageSize;
		const end = start + gridPaginationConfig.pageSize;
		return Promise.resolve({
			hasMore: end < this.allArtists.length,
			items: this.allArtists.slice(start, end),
		});
	}

	retryLoadMore(): void {
		void this.loadNextPage();
	}

	loadMore(): void {
		void this.loadNextPage();
	}

	handleArtistCardLongPress = (card: Card): void => {
		const artist = this.state.artists.find((candidate) => candidate.id === card.id);
		if (!artist) {
			return;
		}

		this.viewModel.transport.getTracksByArtist(artist.id).then((tracks) => {
			if (tracks.length === 0) {
				return;
			}

			this.viewModel.playbackStore.playTracks(tracks);
			this.viewModel.playbackStore.setArtistLogoUrl(artist.logoUrl ?? null);
		});
	};

	onRender(): void {
		const {
			imageCache,
			animationsEnabled,
			navigationController,
			paletteQueue,
			playbackStore,
			transport,
		} = this.viewModel;

		const cards: Array<Card> = this.state.artists.map((artist) => ({
			artworkKey: artist.imageUrl ?? '',
			id: artist.id,
			kind: 'artist',
			primaryText: artist.name,
			secondaryText: '',
		}));

		<scroll style={createScrollStyle(this.state.isFooterVisible)}>
			<CardGrid
				accessibilityLabel='home-artists-grid'
				cards={cards}
				columnCount={this.viewModel.gridColumns}
				infiniteScrollTriggerRatio={gridPaginationConfig.nextPageTriggerRatio}
				isLoadingMore={this.state.isLoadingNextPage}
				onCardLongPress={this.handleArtistCardLongPress}
				onCardTap={(card) => {
					const artist = this.state.artists.find((a) => a.id === card.id);
					if (artist) {
						navigationController.push(
							ArtistView,
							{
								animationsEnabled,
								artist,
								gridColumns: this.viewModel.gridColumns,
								imageCache,
								paletteQueue,
								playbackStore,
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

function createScrollStyle(isFooterVisible: boolean): Style {
	return new Style({
		backgroundColor: theme.colors.bg,
		flexGrow: 1,
		padding: 8,
		paddingBottom: scrollPaddingBottom(isFooterVisible),
		paddingTop: theme.headerHeight,
		width: '100%',
	});
}
