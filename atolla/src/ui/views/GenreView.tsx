import { Style } from 'valdi_core/src/Style';
import type { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';
import { DetachedSlotRenderer } from 'valdi_core/src/slot/DetachedSlotRenderer';
import { INavigatorPageVisibility } from 'valdi_navigation/src/INavigator';
import { NavigationPage } from 'valdi_navigation/src/NavigationPage';
import { NavigationPageStatefulComponent } from 'valdi_navigation/src/NavigationPageComponent';
import type { Label, Layout, ScrollView, View } from 'valdi_tsx/src/NativeTemplateElements';
import type { Album } from '../../models/Album';
import type { Genre } from '../../models/Genre';
import type { Track } from '../../models/Track';
import type { DownloadService, DownloadState } from '../../services/DownloadService';
import type { ImageCache } from '../../services/ImageCache';
import type { PaletteGenerationQueue } from '../../services/PaletteGenerationQueue';
import { type PlaybackStore, shuffleArray } from '../../stores/Playback';
import { scrollPaddingBottom, theme, topInset } from '../../theme';
import type { Transport } from '../../transports/Transport';
import { CreatePlaylistModal } from '../components/CreatePlaylistModal';
import { DetailHeader } from '../components/DetailHeader';
import { FooterNav } from '../components/FooterNav';
import type { FooterTab } from '../components/FooterTab';
import type { HeaderTab } from '../components/HeaderTabs';
import { LibraryHeaderNav } from '../components/LibraryHeaderNav';
import { LoadingView } from '../components/LoadingView';
import { TrackContextMenu } from '../components/TrackContextMenu';
import { TrackList, type TrackListEntry } from '../components/TrackList';
import type { NavBarContext } from '../NavBarContext';
import { AddToPlaylistView } from './AddToPlaylistView';
import { AlbumView } from './AlbumView';
import { resolveGenreImageUrls } from './GenreNavigationResolver';
import { TRACK_PAGE_SIZE } from './GridPagination';
import { PlaylistView } from './PlaylistView';

export interface GenreViewModel {
	animationsEnabled: boolean;
	downloadService: DownloadService;
	genre: Genre;
	gridColumns?: number;
	imageCache: ImageCache;
	isHeaderVisible?: boolean;
	modalSlot?: DetachedSlot;
	navBarContext?: NavBarContext;
	onHeaderVisibilityChange?: (isVisible: boolean) => void;
	onNavigateToArtist?: (artistId: string) => void;
	paletteQueue?: PaletteGenerationQueue;
	playbackStore: PlaybackStore;
	restoreHeaderOnDestroy?: boolean;
	transport: Transport;
}

interface GenreState {
	artistLogoUrls: Array<string | null>;
	contextMenuTrack: Track | null;
	downloadState: DownloadState;
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
	private allTracks: Array<Track> | null = null;
	private currentPage = 0;
	private hasBeenDestroyed = false;
	private hasMoreTracks = true;
	private isLoadingPage = false;
	private triggeredAutoLoadForTrackCount: number | null = null;
	private unsubscribeDownloads?: () => void;
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
		downloadState: 'not_downloaded',
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
		const modalSlot = this.viewModel.navBarContext?.modalSlot ?? this.viewModel.modalSlot;
		const { animationsEnabled, imageCache, onNavigateToArtist, playbackStore, transport } =
			this.viewModel;
		const createPlaylistFn = transport.createPlaylist?.bind(transport);
		modalSlot?.slotted(() => {
			<TrackContextMenu
				animationsEnabled={animationsEnabled}
				imageCache={imageCache}
				onAddToPlaylist={() => {
					this.setState({ contextMenuTrack: null });
					modalSlot?.slotted(() => {
						<AddToPlaylistView
							animationsEnabled={animationsEnabled}
							imageCache={imageCache}
							onDismiss={() => {
								modalSlot?.slotted(() => {});
							}}
							track={track}
							transport={transport}
						/>;
					});
				}}
				onAlbumTap={track.albumId ? this.handleContextMenuAlbumTap : undefined}
				onArtistTap={
					onNavigateToArtist && track.artistId ? this.handleContextMenuArtistTap : undefined
				}
				onCreatePlaylist={
					createPlaylistFn
						? () => {
								this.setState({ contextMenuTrack: null });
								const { animationsEnabled: anim, downloadService, paletteQueue } = this.viewModel;
								modalSlot?.slotted(() => {
									<CreatePlaylistModal
										onCancel={() => {
											modalSlot?.slotted(() => {});
										}}
										onCreate={(name) => {
											return createPlaylistFn(name, track.id).then((playlist) => {
												modalSlot?.slotted(() => {});
												this.navigationController.push(
													PlaylistView,
													{
														animationsEnabled: anim,
														downloadService,
														gridColumns: this.viewModel.gridColumns ?? 2,
														imageCache,
														navBarContext: this.viewModel.navBarContext,
														paletteQueue,
														playbackStore,
														playlist,
														transport,
													},
													{},
													{ animated: anim },
												);
											});
										}}
									/>;
								});
							}
						: undefined
				}
				onDismiss={this.handleContextMenuDismiss}
				playbackStore={playbackStore}
				track={track}
				transport={transport}
			/>;
		});
	};

	handleContextMenuAlbumTap = (): void => {
		const track = this.state.contextMenuTrack;
		if (!track?.albumId) return;
		const album: Album = {
			artistId: track.artistId ?? '',
			artistName: track.artistName ?? '',
			id: track.albumId,
			imageUrl: track.albumImageUrl,
			name: track.albumName ?? '',
		};
		this.handleContextMenuDismiss();
		const { animationsEnabled, downloadService, imageCache, playbackStore, transport } =
			this.viewModel;
		this.navigationController.push(
			AlbumView,
			{
				album,
				animationsEnabled,
				downloadService,
				gridColumns: 3,
				imageCache,
				isHeaderVisible: false,
				modalSlot: this.viewModel.navBarContext?.modalSlot ?? this.viewModel.modalSlot,
				navBarContext: this.viewModel.navBarContext,
				onHeaderVisibilityChange: this.viewModel.onHeaderVisibilityChange,
				playbackStore,
				restoreHeaderOnDestroy: false,
				transport,
			},
			{},
			{ animated: animationsEnabled },
		);
	};

	handleContextMenuDismiss = (): void => {
		const modalSlot = this.viewModel.navBarContext?.modalSlot ?? this.viewModel.modalSlot;
		modalSlot?.slotted(() => {});
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

	handleDownloadTap = (): void => {
		const { downloadService, genre, transport } = this.viewModel;
		Promise.all(
			this.state.tracks.map(async (track, i) => {
				const streamUrl = transport.getTrackCacheUrl?.(track.id);
				if (!streamUrl) {
					return null;
				}

				const existingLogoUrl = this.state.artistLogoUrls[i] ?? null;
				if (existingLogoUrl) {
					return { artistLogoUrl: existingLogoUrl, streamUrl, track };
				}

				if (!track.artistId) {
					return { artistLogoUrl: null, streamUrl, track };
				}

				try {
					const resolvedLogoUrl = await transport.getArtistLogoUrl(track.artistId);
					return { artistLogoUrl: resolvedLogoUrl, streamUrl, track };
				} catch {
					return { artistLogoUrl: null, streamUrl, track };
				}
			}),
		).then((resolvedTracks) => {
			const tracks = resolvedTracks.filter(
				(t): t is { artistLogoUrl: string | null; streamUrl: string; track: Track } => t !== null,
			);

			const uniqueArtistIds = Array.from(
				new Set(
					tracks
						.map(({ track }) => track.artistId)
						.filter((artistId): artistId is string => artistId != null && artistId.length > 0),
				),
			);

			const allTrackGenres = tracks.flatMap(({ track }) => track.genres ?? []);

			Promise.all([
				Promise.all(
					uniqueArtistIds.map((artistId) => transport.getArtist(artistId).catch(() => null)),
				),
				resolveGenreImageUrls(transport, allTrackGenres),
			]).then(([artistResults, resolvedGenres]) => {
				downloadService.downloadGenre({
					artists: artistResults.filter(
						(artist): artist is NonNullable<typeof artist> => artist != null,
					),
					genre,
					resolvedGenres,
					tracks,
				});
			});
		});
	};

	handleRemoveDownloadTap = (): void => {
		this.viewModel.downloadService.removeGenreDownload(this.viewModel.genre.id);
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

	private syncDownloadState(): void {
		this.setState({
			downloadState: this.viewModel.downloadService.getGenreDownloadState(this.viewModel.genre.id),
		});
	}

	onCreate(): void {
		this.navigationController.addPageVisibilityObserver((visibility) => {
			if (visibility === INavigatorPageVisibility.VISIBLE) {
				this.navigationController.disableDismissalGesture()();
			}
		});
		this.hasBeenDestroyed = false;
		this.viewModel.onHeaderVisibilityChange?.(false);
		this.setHeaderVisibility(false);
		const { downloadService, playbackStore } = this.viewModel;
		this.unsubscribePlayback = playbackStore.subscribe(() => {
			this.setState({ isFooterVisible: playbackStore.track !== null });
		});
		this.unsubscribeDownloads = downloadService.subscribe(() => {
			this.syncDownloadState();
		});
		this.setState({ isFooterVisible: playbackStore.track !== null });
		this.syncDownloadState();
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

	private handleFooterNavTabTap = (tab: FooterTab): void => {
		this.navigationController.pop();
		this.viewModel.navBarContext?.onFooterTabTap(tab);
	};

	private handleHeaderNavTabTap = (tab: HeaderTab): void => {
		this.navigationController.pop();
		this.viewModel.navBarContext?.header?.onTabTap(tab);
	};

	onDestroy(): void {
		this.hasBeenDestroyed = true;
		this.unsubscribeDownloads?.();
		this.unsubscribePlayback?.();
		if (this.viewModel.restoreHeaderOnDestroy ?? true) {
			this.viewModel.onHeaderVisibilityChange?.(true);
		}
	}

	onRender(): void {
		const {
			downloadState,
			isFooterVisible,
			isHeaderVisible,
			isLoading,
			isLoadingNextPage,
			nextPageFailed,
			totalTrackCount,
			tracks,
		} = this.state;
		const { genre, imageCache } = this.viewModel;

		const entries: Array<TrackListEntry> = tracks.map((track) => ({
			artworkSource: track.albumImageUrl ?? null,
			id: track.id,
			meta: track.artistName ?? '',
			title: track.name,
			track,
		}));

		const totalDuration = tracks.reduce((sum, t) => sum + t.duration, 0);

		<layout accessibilityLabel='genre-view' style={styles.root}>
			<view style={styles.fullScreen}>
				<scroll style={createScrollStyle(isFooterVisible, isHeaderVisible)}>
					<DetailHeader
						animationsEnabled={this.viewModel.animationsEnabled}
						artworkCategory='album_art'
						artworkSource={genre.imageUrl ?? null}
						downloadState={downloadState}
						fallbackText={genre.name}
						imageCache={this.viewModel.imageCache}
						modalSlot={this.viewModel.navBarContext?.modalSlot ?? this.viewModel.modalSlot}
						onAddToQueue={tracks.length > 0 ? this.handleHeaderAddToQueueTap : undefined}
						onDownload={this.handleDownloadTap}
						onHideHeaderGesture={() => {
							this.setHeaderVisibility(false);
						}}
						onPlay={tracks.length > 0 ? this.handleHeaderPlayTap : undefined}
						onRemoveDownload={this.handleRemoveDownloadTap}
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
							accessibilityId='genre-load-more-trigger'
							accessibilityLabel='genre-load-more-trigger'
							onLayout={() => {
								this.handleLoadMoreTriggerLayout();
							}}
							style={styles.loadMoreTrigger}
						/>
					)}
					{isLoadingNextPage && <label style={styles.loadMoreLabel} value='Loading more...' />}
					{nextPageFailed && (
						<view
							accessibilityId='genre-load-more-retry'
							accessibilityLabel='genre-load-more-retry'
							onTap={this.retryLoadMore}
							style={styles.loadMoreRetryContainer}
						>
							<label style={styles.loadMoreRetryLabel} value='Failed to load more. Tap to retry.' />
						</view>
					)}
				</scroll>
				{this.viewModel.navBarContext && (
					<FooterNav
						activeTab={this.viewModel.navBarContext.activeFooterTab}
						downloadingCount={this.viewModel.navBarContext.downloadingCount}
						onFooterTabTap={this.handleFooterNavTabTap}
					/>
				)}
				{this.viewModel.navBarContext?.nowPlayingOverlaySlot && (
					<DetachedSlotRenderer detachedSlot={this.viewModel.navBarContext.nowPlayingOverlaySlot} />
				)}
				{this.viewModel.navBarContext?.header && isHeaderVisible && (
					<LibraryHeaderNav
						activeTab={this.viewModel.navBarContext.header.activeTab}
						animationsEnabled={this.viewModel.navBarContext.header.animationsEnabled}
						connectionMode={this.viewModel.navBarContext.header.connectionMode}
						onAlphabetLetterTap={this.viewModel.navBarContext.header.onAlphabetLetterTap}
						onRequestModeChange={this.viewModel.navBarContext.header.onRequestModeChange}
						onTabTap={this.handleHeaderNavTabTap}
					/>
				)}
			</view>
		</layout>;
	}
}

const styles = {
	fullScreen: new Style<View>({
		height: '100%',
		position: 'relative',
		width: '100%',
	}),
	loadMoreLabel: new Style<Label>({
		...theme.text.sub,
		marginTop: 12,
		textAlign: 'center',
	}),
	loadMoreRetryContainer: new Style<Layout>({
		alignItems: 'center',
		marginTop: 12,
		paddingBottom: 8,
		paddingTop: 8,
	}),
	loadMoreRetryLabel: new Style<Label>({
		...theme.text.main,
		textAlign: 'center',
	}),
	loadMoreTrigger: new Style<View>({
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

function createScrollStyle(isFooterVisible: boolean, isHeaderVisible: boolean): Style<ScrollView> {
	return new Style<ScrollView>({
		backgroundColor: theme.colors.bg,
		flexGrow: 1,
		padding: 8,
		paddingBottom: scrollPaddingBottom(isFooterVisible),
		paddingTop: isHeaderVisible ? theme.headerHeight + topInset + 16 : topInset + 8,
		width: '100%',
	});
}
