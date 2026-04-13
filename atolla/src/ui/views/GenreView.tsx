// @ts-nocheck
import { Style } from 'valdi_core/src/Style';
import { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';
import { DetachedSlotRenderer } from 'valdi_core/src/slot/DetachedSlotRenderer';
import { NavigationPage } from 'valdi_navigation/src/NavigationPage';
import { NavigationPageStatefulComponent } from 'valdi_navigation/src/NavigationPageComponent';
import type { Genre } from '../../models/Genre';
import type { Track } from '../../models/Track';
import type { ImageCache } from '../../services/ImageCache';
import { type PlaybackStore, shuffleArray } from '../../stores/Playback';
import { scrollPaddingBottom, theme } from '../../theme';
import type { Transport } from '../../transports/Transport';
import { DetailHeader } from '../components/DetailHeader';
import { LoadingView } from '../components/LoadingView';
import { TrackContextMenu } from '../components/TrackContextMenu';
import { TrackList, type TrackListEntry } from '../components/TrackList';

const TRACK_PAGE_SIZE = 50;

export interface GenreViewModel {
	animationsEnabled: boolean;
	genre: Genre;
	imageCache: ImageCache;
	isHeaderVisible?: boolean;
	onHeaderVisibilityChange?: (isVisible: boolean) => void;
	onNavigateToArtist?: (artistId: string) => void;
	playbackStore: PlaybackStore;
	restoreHeaderOnDestroy?: boolean;
	transport: Transport;
}

interface GenreState {
	artistLogoUrls: Array<string | null>;
	contextMenuTrack: Track | null;
	isFooterVisible: boolean;
	isHeaderVisible: boolean;
	isLoading: boolean;
	isLoadingNextPage: boolean;
	nextPageFailed: boolean;
	totalTrackCount: number | null;
	tracks: Array<Track>;
}

@NavigationPage(module)
export class GenreView extends NavigationPageStatefulComponent<GenreViewModel, GenreState> {
	private modalSlot = new DetachedSlot();
	private allTracks: Array<Track> | null = null;
	private currentPage = 0;
	private hasBeenDestroyed = false;
	private hasMoreTracks = true;
	private isLoadingPage = false;
	private triggeredAutoLoadForTrackCount: number | null = null;
	private unsubscribePlayback?: () => void;
	private readonly setHeaderVisibility = (isVisible: boolean): void => {
		if (this.state.isHeaderVisible === isVisible) {
			return;
		}

		this.setState({ isHeaderVisible: isVisible });
		this.viewModel.onHeaderVisibilityChange?.(isVisible);
	};

	state: GenreState = {
		artistLogoUrls: [],
		contextMenuTrack: null,
		isFooterVisible: false,
		isHeaderVisible: false,
		isLoading: true,
		isLoadingNextPage: false,
		nextPageFailed: false,
		totalTrackCount: null,
		tracks: [],
	};

	handleTrackLongPress = (track: Track): void => {
		this.setState({ contextMenuTrack: track });
	};

	handleContextMenuDismiss = (): void => {
		this.setState({ contextMenuTrack: null });
	};

	handleHeaderPlayTap = (): void => {
		const { playbackStore } = this.viewModel;
		const { artistLogoUrls, tracks } = this.state;
		playbackStore.playWithArtistLogos(tracks, artistLogoUrls);
	};

	handleHeaderShuffleTap = (): void => {
		const { playbackStore } = this.viewModel;
		const { artistLogoUrls, tracks } = this.state;
		const indices = shuffleArray(tracks.map((_, i) => i));
		playbackStore.playWithArtistLogos(
			indices.map((i) => tracks[i]),
			indices.map((i) => artistLogoUrls[i] ?? null),
		);
	};

	handleHeaderAddToQueueTap = (): Promise<void> => {
		this.viewModel.playbackStore.addToQueue(this.state.tracks);
		return Promise.resolve();
	};

	handleTrackTap = (trackId: string): void => {
		const { playbackStore } = this.viewModel;
		const { artistLogoUrls, tracks } = this.state;
		const trackIndex = this.state.tracks.findIndex((track) => track.id === trackId);
		if (trackIndex < 0) {
			return;
		}

		playbackStore.playWithArtistLogos(tracks, artistLogoUrls, trackIndex);
	};

	handleContextMenuArtistTap = (): void => {
		const artistId = this.state.contextMenuTrack?.artistId;
		if (!artistId) {
			return;
		}

		this.viewModel.onNavigateToArtist?.(artistId);
	};

	onCreate(): void {
		this.hasBeenDestroyed = false;
		this.viewModel.onHeaderVisibilityChange?.(false);
		this.setHeaderVisibility(false);
		const { playbackStore } = this.viewModel;
		this.unsubscribePlayback = playbackStore.subscribe(() => {
			this.setState({ isFooterVisible: playbackStore.track !== null });
		});
		this.setState({ isFooterVisible: playbackStore.track !== null });
		void this.loadNextPage();
	}

	onViewModelUpdate(prevViewModel?: GenreViewModel): void {
		if (!prevViewModel) {
			return;
		}

		if (
			this.viewModel.isHeaderVisible !== prevViewModel.isHeaderVisible &&
			this.viewModel.isHeaderVisible !== this.state.isHeaderVisible
		) {
			this.viewModel.onHeaderVisibilityChange?.(this.state.isHeaderVisible);
		}
	}

	private async loadNextPage(): Promise<void> {
		if (this.hasBeenDestroyed || this.isLoadingPage || !this.hasMoreTracks) {
			return;
		}

		const nextPage = this.currentPage + 1;
		const isFirstPage = nextPage === 1;
		this.isLoadingPage = true;
		if (!isFirstPage) {
			this.setState({ isLoadingNextPage: true, nextPageFailed: false });
		}

		try {
			const result = await this.fetchPage(nextPage);
			if (this.hasBeenDestroyed) return;

			const artistLogoUrls = await Promise.all(
				result.items.map((t) =>
					t.artistId ? this.viewModel.transport.getArtistLogoUrl(t.artistId) : null,
				),
			);
			if (this.hasBeenDestroyed) return;

			const tracks = isFirstPage ? result.items : [...this.state.tracks, ...result.items];
			const allArtistLogoUrls = isFirstPage
				? artistLogoUrls
				: [...this.state.artistLogoUrls, ...artistLogoUrls];

			this.currentPage = nextPage;
			this.hasMoreTracks = result.hasMore;
			this.isLoadingPage = false;

			const totalTrackCount = isFirstPage
				? (this.viewModel.genre.trackCount ?? result.totalCount ?? tracks.length)
				: this.state.totalTrackCount;

			this.setState({
				artistLogoUrls: allArtistLogoUrls,
				isLoading: false,
				isLoadingNextPage: false,
				nextPageFailed: false,
				totalTrackCount,
				tracks,
			});
		} catch {
			if (this.hasBeenDestroyed) return;
			this.isLoadingPage = false;
			this.setState({ isLoading: false, isLoadingNextPage: false, nextPageFailed: true });
		}
	}

	private fetchPage(
		page: number,
	): Promise<{ hasMore: boolean; items: Array<Track>; totalCount?: number }> {
		const { genre, transport } = this.viewModel;
		if (transport.getTracksByGenrePage) {
			return transport.getTracksByGenrePage(genre.id, page, TRACK_PAGE_SIZE);
		}

		if (!this.allTracks) {
			return transport.getTracksByGenre(genre.id).then((tracks) => {
				this.allTracks = tracks;
				const start = (page - 1) * TRACK_PAGE_SIZE;
				const end = start + TRACK_PAGE_SIZE;
				return {
					hasMore: end < tracks.length,
					items: tracks.slice(start, end),
					totalCount: tracks.length,
				};
			});
		}

		const start = (page - 1) * TRACK_PAGE_SIZE;
		const end = start + TRACK_PAGE_SIZE;
		return Promise.resolve({
			hasMore: end < this.allTracks.length,
			items: this.allTracks.slice(start, end),
			totalCount: this.allTracks.length,
		});
	}

	private handleLoadMoreTriggerLayout(): void {
		if (
			this.isLoadingPage ||
			this.state.nextPageFailed ||
			!this.hasMoreTracks ||
			this.state.isLoading
		) {
			return;
		}

		if (this.triggeredAutoLoadForTrackCount === this.state.tracks.length) {
			return;
		}

		this.triggeredAutoLoadForTrackCount = this.state.tracks.length;
		void this.loadNextPage();
	}

	retryLoadMore = (): void => {
		this.triggeredAutoLoadForTrackCount = null;
		void this.loadNextPage();
	};

	onDestroy(): void {
		this.hasBeenDestroyed = true;
		this.unsubscribePlayback?.();
		if (this.viewModel.restoreHeaderOnDestroy ?? true) {
			this.viewModel.onHeaderVisibilityChange?.(true);
		}
	}

	onRender(): void {
		const {
			contextMenuTrack,
			isFooterVisible,
			isHeaderVisible,
			isLoading,
			isLoadingNextPage,
			nextPageFailed,
			totalTrackCount,
			tracks,
		} = this.state;
		const { genre, imageCache, onNavigateToArtist, playbackStore, transport } = this.viewModel;

		const entries: Array<TrackListEntry> = tracks.map((track) => ({
			artworkSource: track.albumImageUrl ?? null,
			id: track.id,
			meta: track.artistName,
			title: track.name,
			track,
		}));

		const totalDuration = tracks.reduce((sum, t) => sum + t.duration, 0);

		<layout accessibilityLabel='genre-view' contentDescription='genre-view' style={styles.root}>
			<scroll style={createScrollStyle(isFooterVisible, isHeaderVisible)}>
				<DetailHeader
					animationsEnabled={this.viewModel.animationsEnabled}
					artworkCategory='album_art'
					artworkSource={genre.imageUrl ?? null}
					fallbackText={genre.name}
					imageCache={this.viewModel.imageCache}
					modalSlot={this.modalSlot}
					onAddToQueue={tracks.length > 0 ? this.handleHeaderAddToQueueTap : undefined}
					onHideHeaderGesture={() => {
						this.setHeaderVisibility(false);
					}}
					onPlay={tracks.length > 0 ? this.handleHeaderPlayTap : undefined}
					onRevealHeaderGesture={() => {
						this.setHeaderVisibility(true);
					}}
					onShuffle={tracks.length > 0 ? this.handleHeaderShuffleTap : undefined}
					subheaderLineOneLeft={
						totalTrackCount != null
							? `${totalTrackCount} tracks`
							: tracks.length > 0
								? `${tracks.length} tracks`
								: null
					}
					subheaderLineOneRight={tracks.length > 0 ? formatDuration(totalDuration) : null}
				/>
				{isLoading ? (
					<LoadingView />
				) : (
					<TrackList
						imageCache={imageCache}
						onTrackLongPress={this.handleTrackLongPress}
						onTrackTap={this.handleTrackTap}
						tracks={entries}
					/>
				)}
				{!isLoading && this.hasMoreTracks && !nextPageFailed && (
					<view
						accessibilityLabel='genre-load-more-trigger'
						contentDescription='genre-load-more-trigger'
						onLayout={() => {
							this.handleLoadMoreTriggerLayout();
						}}
						style={styles.loadMoreTrigger}
					/>
				)}
				{isLoadingNextPage && <label style={styles.loadMoreLabel} value='Loading more...' />}
				{nextPageFailed && (
					<view
						accessibilityLabel='genre-load-more-retry'
						contentDescription='genre-load-more-retry'
						onTap={this.retryLoadMore}
						style={styles.loadMoreRetryContainer}
					>
						<label style={styles.loadMoreRetryLabel} value='Failed to load more. Tap to retry.' />
					</view>
				)}
			</scroll>
			{contextMenuTrack && (
				<TrackContextMenu
					animationsEnabled={this.viewModel.animationsEnabled}
					imageCache={imageCache}
					onArtistTap={
						onNavigateToArtist && contextMenuTrack.artistId
							? this.handleContextMenuArtistTap
							: undefined
					}
					onDismiss={this.handleContextMenuDismiss}
					playbackStore={playbackStore}
					track={contextMenuTrack}
					transport={transport}
				/>
			)}
			<DetachedSlotRenderer detachedSlot={this.modalSlot} />
		</layout>;
	}
}

const styles = {
	loadMoreLabel: new Style({
		...theme.text.sub,
		marginTop: 12,
		textAlign: 'center',
	}),
	loadMoreRetryContainer: new Style({
		alignItems: 'center',
		marginTop: 12,
		paddingVertical: 8,
	}),
	loadMoreRetryLabel: new Style({
		...theme.text.main,
		textAlign: 'center',
	}),
	loadMoreTrigger: new Style({
		height: 1,
		width: '100%',
	}),
	root: new Style({
		backgroundColor: theme.colors.bg,
		flexGrow: 1,
		width: '100%',
	}),
};

function formatDuration(seconds: number): string {
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const s = seconds % 60;
	const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
	return h > 0 ? `${h}:${mm}:${String(s).padStart(2, '0')}` : `${mm}:${String(s).padStart(2, '0')}`;
}

function createScrollStyle(isFooterVisible: boolean, isHeaderVisible: boolean): Style {
	return new Style({
		backgroundColor: theme.colors.bg,
		flexGrow: 1,
		padding: 8,
		paddingBottom: scrollPaddingBottom(isFooterVisible),
		paddingTop: isHeaderVisible ? theme.headerHeight + 16 : 8,
		width: '100%',
	});
}
