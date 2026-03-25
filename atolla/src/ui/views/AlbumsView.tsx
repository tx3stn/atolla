// @ts-nocheck

import { StatefulComponent } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { NavigationController } from 'valdi_navigation/src/NavigationController';
import type { Album } from '../../models/Album';
import type { ImageCache } from '../../services/ImageCache';
import type { PlaybackStore } from '../../stores/Playback';
import { scrollPaddingBottom, theme } from '../../theme';
import type { Transport } from '../../transports/Transport';
import { type Card, CardGrid } from '../components/CardGrid';
import { type AlbumSort, AlbumSorts, sortAlbums } from './AlbumsSort';
import { AlbumView } from './AlbumView';
import { gridPaginationConfig } from './GridPagination';

export interface AlbumsViewModel {
	animationsEnabled: boolean;
	imageCache: ImageCache;
	navigationController: NavigationController;
	playbackStore: PlaybackStore;
	transport: Transport;
}

interface AlbumsState {
	albums: Array<Album>;
	hasMore: boolean;
	isFooterVisible: boolean;
	isLoadingNextPage: boolean;
	nextPageFailed: boolean;
	page: number;
	sort: AlbumSort;
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
	private currentPage = 0;
	private hasBeenDestroyed = false;
	private isLoadingPage = false;
	private unsubscribePlayback?: () => void;

	state: AlbumsState = {
		albums: [],
		hasMore: true,
		isFooterVisible: false,
		isLoadingNextPage: false,
		nextPageFailed: false,
		page: 0,
		sort: AlbumSorts.alphabetical,
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

			const albums = isFirstPage ? page.items : [...this.state.albums, ...page.items];
			this.currentPage = nextPage;
			this.isLoadingPage = false;
			void this.viewModel.imageCache.prefetch(
				page.items.map((a) => a.imageUrl).filter((url): url is string => url != null),
			);
			this.setState({
				albums,
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
			if (!isFirstPage) {
				this.setState({ isLoadingNextPage: false, nextPageFailed: true });
			}
		}
	}

	private fetchPage(page: number): Promise<AlbumPageResult> {
		const transport = this.viewModel.transport as Transport & Partial<PagedAlbumsTransport>;
		if (transport.getAlbumsPage) {
			return transport.getAlbumsPage(page, gridPaginationConfig.pageSize);
		}

		if (!this.allAlbums) {
			return this.viewModel.transport.getAllAlbums().then((albums) => {
				this.allAlbums = albums;
				const sorted = sortAlbums(this.allAlbums, this.state.sort);
				const start = (page - 1) * gridPaginationConfig.pageSize;
				const end = start + gridPaginationConfig.pageSize;
				return { hasMore: end < sorted.length, items: sorted.slice(start, end) };
			});
		}

		const sorted = sortAlbums(this.allAlbums, this.state.sort);
		const start = (page - 1) * gridPaginationConfig.pageSize;
		const end = start + gridPaginationConfig.pageSize;
		return Promise.resolve({ hasMore: end < sorted.length, items: sorted.slice(start, end) });
	}

	retryLoadMore(): void {
		void this.loadNextPage();
	}

	loadMore(): void {
		void this.loadNextPage();
	}

	onRender(): void {
		const { imageCache, animationsEnabled, navigationController, playbackStore, transport } =
			this.viewModel;

		const cards: Array<Card> = this.state.albums.map((album) => ({
			artworkKey: album.imageUrl ?? '',
			id: album.id,
			kind: 'album',
			primaryText: album.name,
			secondaryText: album.artistName,
		}));

		<scroll style={createScrollStyle(this.state.isFooterVisible)}>
			<CardGrid
				accessibilityLabel='home-albums-grid'
				cards={cards}
				imageCache={imageCache}
				isLoadingMore={this.state.isLoadingNextPage}
				onCardTap={(card) => {
					const album = this.state.albums.find((a) => a.id === card.id);
					if (album) {
						navigationController.push(
							AlbumView,
							{ album, imageCache, playbackStore, transport },
							{},
							{ animated: animationsEnabled },
						);
					}
				}}
				onLoadMore={
					this.state.hasMore && !this.state.nextPageFailed && !this.state.isLoadingNextPage
						? () => this.loadMore()
						: undefined
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
		paddingTop: 0,
		width: '100%',
	});
}
