import type { CancelablePromise } from 'valdi_core/src/CancelablePromise';
import { ElementRef } from 'valdi_core/src/ElementRef';
import { Style } from 'valdi_core/src/Style';
import type { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';
import { INavigatorPageVisibility } from 'valdi_navigation/src/INavigator';
import type { NavigationController } from 'valdi_navigation/src/NavigationController';
import { NavigationPage } from 'valdi_navigation/src/NavigationPage';
import { NavigationPageStatefulComponent } from 'valdi_navigation/src/NavigationPageComponent';
import type { ContentSizeChangeEvent } from 'valdi_tsx/src/GestureEvents';
import type { Label, Layout, ScrollView, View } from 'valdi_tsx/src/NativeTemplateElements';
import type { Album } from '../../models/Album';
import { HeaderTabs } from '../../models/App';
import type { Playlist } from '../../models/Playlist';
import type { Track } from '../../models/Track';
import Strings from '../../Strings';
import { backNavRouter } from '../../services/BackNavRouter';
import type { DownloadService, DownloadState } from '../../services/DownloadService';
import { resolveDownloadTracks } from '../../services/DownloadTrackResolver';
import type { ImageCache } from '../../services/ImageCache';
import { startPagedPlayback } from '../../services/PagedPlayback';
import type { PaletteGenerationQueue } from '../../services/PaletteGenerationQueue';
import type { PlaylistEditService } from '../../services/PlaylistEditService';
import type { ToastService } from '../../services/ToastService';
import type { TrackSource } from '../../services/TrackSource';
import type { ViewCache } from '../../services/ViewCache';
import { HeaderCollapse, headerStore } from '../../stores/Header';
import type { PlaybackStore } from '../../stores/Playback';
import type { Preferences } from '../../stores/Preferences';
import { theme } from '../../theme';
import type { TrackPageSort, Transport } from '../../transports/Transport';
import { fireAndForget } from '../../utils/Async';
import { formatDuration } from '../../utils/Time';
import { DetailHeader } from '../components/DetailHeader';
import { LoadingView } from '../components/LoadingView';
import { Modal } from '../components/Modal';
import { RefreshableScroll } from '../components/RefreshableScroll';
import { ScrollDragAutoScroller } from '../components/ScrollDragAutoScroller';
import { TrackList } from '../components/TrackList';
import { type DerivedTracks, deriveTracks } from '../components/TrackListEntries';
import { closeSlot } from '../flows/ModalSlotFlow';
import { type DetailPushDeps, pushAlbum, pushPlaylist } from '../flows/PushDetail';
import { openTrackContextMenu } from '../flows/TrackContextMenu';
import { TRACK_PAGE_SIZE } from '../pagination/Grid';

export interface PlaylistViewModel {
	downloadService: DownloadService;
	imageCache: ImageCache;
	modalSlot: DetachedSlot;
	navigationController: NavigationController;
	onExitFromSearchNavigation?: () => void;
	onNavigateToArtist?: (artistId: string) => void;
	onRootDetailControllerReady: (controller: NavigationController) => void;
	paletteQueue?: PaletteGenerationQueue;
	playbackStore: PlaybackStore;
	playlist: Playlist;
	playlistEditService?: PlaylistEditService;
	preferences: Preferences;
	toastService: ToastService;
	transport: Transport;
	viewCache: ViewCache;
}

interface PlaylistState {
	downloadState: DownloadState;
	hydratedPlaylist: Playlist | null;
	isLoading: boolean;
	isLoadingNextPage: boolean;
	isRefreshing: boolean;
	nextPageFailed: boolean;
	removedTrackPending: { index: number; track: Track } | null;
	revision: number;
	totalTrackCount: number | null;
	tracks: Array<Track>;
}

interface PlaylistCachePayload {
	hydratedPlaylist: Playlist | null;
	totalTrackCount: number | null;
	tracks: Array<Track>;
}

type PlaylistTracksPage = { hasMore: boolean; items: Array<Track>; totalCount?: number };

@NavigationPage(module)
export class PlaylistView extends NavigationPageStatefulComponent<
	PlaylistViewModel,
	PlaylistState
> {
	state: PlaylistState = {
		downloadState: 'not_downloaded',
		hydratedPlaylist: null,
		isLoading: true,
		isLoadingNextPage: false,
		isRefreshing: false,
		nextPageFailed: false,
		removedTrackPending: null,
		revision: 0,
		totalTrackCount: null,
		tracks: [],
	};

	onCreate(): void {
		backNavRouter.registerPage(this.navigationController);
		this.registerDisposable(() => backNavRouter.unregisterPage(this.navigationController));
		this.registerDisposable(() => this.headerCollapse.reset());
		const headerSectionId = headerStore.pushDetailSection(HeaderTabs.playlists);
		this.registerDisposable(() => headerStore.clearDetailSection(headerSectionId));
		this.viewModel.onRootDetailControllerReady(this.navigationController);
		this.navigationController.addPageVisibilityObserver((visibility) => {
			if (visibility === INavigatorPageVisibility.VISIBLE) {
				this.navigationController.disableDismissalGesture()();
			}
		});

		this.registerDisposable(
			this.viewModel.downloadService.subscribe(() => {
				this.syncDownloadState();
			}),
		);
		this.registerDisposable(this.viewModel.preferences.subscribe(this.bump));
		this.registerDisposable(() => this.cancelInFlightReads());
		this.syncDownloadState();
		this.seedFromCache();
		this.resetAndLoadPlaylistData();
	}

	onRender(): void {
		const { downloadState, isLoading, isLoadingNextPage, nextPageFailed, totalTrackCount, tracks } =
			this.state;
		// self-heal: a playlist pushed without imageUrl gets the fetched one merged in for the header
		const playlist = { ...this.viewModel.playlist, ...(this.state.hydratedPlaylist ?? {}) };

		const { entries, totalDuration } = this.getDerivedTracks(tracks);

		<layout accessibilityLabel='playlist-view' style={styles.root}>
			<view accessibilityId='playlist-view' style={styles.fullScreen}>
				<RefreshableScroll
					accessibilityId='playlist'
					isRefreshing={this.state.isRefreshing}
					onContentSizeChange={this.handleContentSizeChange}
					onRefresh={this.handleRefresh}
					onScroll={this.handleScroll}
					scrollRef={this.scrollRef}
					style={styles.scroll}
				>
					<DetailHeader
						animationsEnabled={this.viewModel.preferences.animationsEnabled}
						artworkCategory='playlist_image'
						artworkSource={playlist.imageUrl ?? null}
						downloadState={downloadState}
						fallbackText={playlist.name}
						modalSlot={this.viewModel.modalSlot}
						onAddToQueue={tracks.length > 0 ? this.handleHeaderAddToQueueTap : undefined}
						onDownload={this.handleDownloadTap}
						onPlay={tracks.length > 0 ? this.handleHeaderPlayTap : undefined}
						onRemoveDownload={this.handleRemoveDownloadTap}
						onShuffle={tracks.length > 0 ? this.handleHeaderShuffleTap : undefined}
						subheaderLineOneLeft={
							totalTrackCount != null
								? `${totalTrackCount} tracks`
								: tracks.length > 0
									? `${tracks.length} tracks`
									: null
						}
						subheaderLineOneRight={tracks.length > 0 ? formatDuration(totalDuration) : null}
						toastService={this.viewModel.toastService}
					/>
					{isLoading ? (
						<LoadingView />
					) : (
						<TrackList
							animationsEnabled={this.viewModel.preferences.animationsEnabled}
							dragScroller={this.dragAutoScroller}
							imageCache={this.viewModel.imageCache}
							onTrackLongPress={this.handleTrackLongPress}
							onTrackReorder={this.handleTrackReorder}
							onTrackSwipeRemove={this.handleTrackSwipeRemove}
							onTrackTap={this.handleTrackTap}
							rowIdentityPrefix='playlist-track-'
							showDragHandles={true}
							tracks={entries}
						/>
					)}
					{!isLoading && this.hasMoreTracks && !nextPageFailed && (
						<view
							accessibilityId='playlist-load-more-trigger'
							accessibilityLabel='playlist-load-more-trigger'
							onVisibilityChanged={this.handleLoadMoreTriggerVisibility}
							style={styles.loadMoreTrigger}
						/>
					)}
					{isLoadingNextPage && <label style={styles.loadMoreLabel} value={Strings.loading()} />}
					{nextPageFailed && (
						<view
							accessibilityId='playlist-load-more-retry'
							accessibilityLabel='playlist-load-more-retry'
							onTap={this.retryLoadMore}
							style={styles.loadMoreRetryContainer}
						>
							<label
								numberOfLines={0}
								style={styles.loadMoreRetryLabel}
								value={Strings.failedToLoadMore()}
							/>
						</view>
					)}
				</RefreshableScroll>
			</view>
		</layout>;
	}

	onViewModelUpdate(prevViewModel?: PlaylistViewModel): void {
		if (!prevViewModel) {
			return;
		}

		if (
			this.viewModel.transport !== prevViewModel.transport ||
			this.viewModel.playlist.id !== prevViewModel.playlist.id
		) {
			this.resetAndLoadPlaylistData();
		}
	}

	private cachedDerivedTracks: DerivedTracks = { entries: [], totalDuration: 0 };
	private cachedDerivedTracksSource: Array<Track> | null = null;
	private currentPage = 0;
	private hasMoreTracks = true;
	private loadGeneration = 0;
	private isLoadingPage = false;
	private inFlightPageRead?: CancelablePromise<PlaylistTracksPage>;
	private inFlightHydrateRead?: CancelablePromise<Playlist | null>;
	private scrollRef = new ElementRef();
	private dragAutoScroller = new ScrollDragAutoScroller(this.scrollRef);
	private headerCollapse = new HeaderCollapse(headerStore);
	private triggeredAutoLoadForTrackCount: number | null = null;

	private bump = (): void => {
		this.setState({ revision: this.state.revision + 1 });
	};

	private cancelInFlightReads(): void {
		this.inFlightPageRead?.cancel?.();
		this.inFlightPageRead = undefined;
		this.inFlightHydrateRead?.cancel?.();
		this.inFlightHydrateRead = undefined;
	}

	private getDerivedTracks(tracks: Array<Track>): DerivedTracks {
		if (tracks !== this.cachedDerivedTracksSource) {
			this.cachedDerivedTracksSource = tracks;
			this.cachedDerivedTracks = deriveTracks(tracks);
		}

		return this.cachedDerivedTracks;
	}

	private detailDeps(): DetailPushDeps {
		return {
			downloadService: this.viewModel.downloadService,
			imageCache: this.viewModel.imageCache,
			modalSlot: this.viewModel.modalSlot,
			onNavigateToArtist: this.viewModel.onNavigateToArtist,
			paletteQueue: this.viewModel.paletteQueue,
			playbackStore: this.viewModel.playbackStore,
			playlistEditService: this.viewModel.playlistEditService,
			preferences: this.viewModel.preferences,
			toastService: this.viewModel.toastService,
			transport: this.viewModel.transport,
			viewCache: this.viewModel.viewCache,
		};
	}

	private handleTrackLongPress = (track: Track): void => {
		const { imageCache, playbackStore, transport } = this.viewModel;
		const { animationsEnabled, gridColumns } = this.viewModel.preferences;
		const modalSlot = this.viewModel.modalSlot;
		const { albumId, artistId } = track;

		openTrackContextMenu(track, modalSlot, {
			animationsEnabled,
			gridColumns,
			imageCache,
			onAlbumTap: albumId
				? () => {
						const album: Album = {
							artistId: track.artistId ?? '',
							artistName: track.artistName ?? '',
							id: albumId,
							imageUrl: track.albumImageUrl,
							name: track.albumName ?? '',
						};
						pushAlbum(this.navigationController, this.detailDeps(), album);
					}
				: undefined,
			onArtistTap:
				this.viewModel.onNavigateToArtist && artistId
					? () => this.viewModel.onNavigateToArtist?.(artistId)
					: undefined,
			onDismiss: () => {},
			onPlaylistCreated: (playlist) => {
				pushPlaylist(this.navigationController, this.detailDeps(), playlist);
			},
			playbackStore,
			toastService: this.viewModel.toastService,
			transport,
		});
	};

	private closeModalSlot = (): void => {
		const modalSlot = this.viewModel.modalSlot;
		closeSlot(modalSlot);
	};

	handleTrackReorder = (fromEntryIndex: number, toEntryIndex: number): void => {
		const { playlist, playlistEditService, transport } = this.viewModel;
		if (!playlistEditService) return;
		const prevTracks = this.state.tracks;

		const tracks = [...prevTracks];
		const [movedTrack] = tracks.splice(fromEntryIndex, 1);
		tracks.splice(toEntryIndex, 0, movedTrack);

		this.setState({ tracks });

		if (!movedTrack.playlistItemId) {
			console.warn('[playlist] missing playlistItemId on move, aborting reorder');
			this.setState({ tracks: prevTracks });
			return;
		}

		void playlistEditService
			.execute(
				{
					playlistId: playlist.id,
					playlistName: playlist.name,
					toIndex: toEntryIndex,
					trackId: movedTrack.playlistItemId,
					type: 'move',
				},
				transport,
			)
			.then((result) => {
				if (result) {
					this.setState({ tracks: prevTracks });
					this.showEditErrorModal(result.type, result.playlistName, result.error);
				}
			});
	};

	private handleTrackSwipeRemove = (_trackId: string, entryIndex: number): void => {
		const { playlistEditService } = this.viewModel;
		if (!playlistEditService) return;
		const trackToRemove = this.state.tracks[entryIndex];
		if (!trackToRemove?.playlistItemId) {
			console.warn('[playlist] missing playlistItemId on remove, aborting');
			return;
		}
		const tracks = [...this.state.tracks];
		const [removedTrack] = tracks.splice(entryIndex, 1);

		this.setState({
			removedTrackPending: { index: entryIndex, track: removedTrack },
			tracks,
		});

		this.viewModel.modalSlot?.slotted(() => {
			<Modal
				animationsEnabled={this.viewModel.preferences.animationsEnabled}
				body={Strings.removeFromPlaylistBody(removedTrack.name)}
				cancelAccessibilityId='playlist-remove-cancel'
				confirmAccessibilityId='playlist-remove-confirm'
				modalAccessibilityId='playlist-remove-modal'
				onClose={this.handleCancelRemoveFromPlaylist}
				onConfirm={this.handleConfirmRemoveFromPlaylistTap}
				title={Strings.removeFromPlaylistTitle()}
			/>;
		});
	};

	private handleConfirmRemoveFromPlaylistTap = (): void => {
		const { playlist, playlistEditService } = this.viewModel;
		const trackId = this.state.removedTrackPending?.track.playlistItemId;
		if (!playlistEditService || !trackId) return;
		const { removedTrackPending } = this.state;

		closeSlot(this.viewModel.modalSlot);
		this.setState({ removedTrackPending: null });
		void playlistEditService
			.execute(
				{ playlistId: playlist.id, playlistName: playlist.name, trackId, type: 'remove' },
				this.viewModel.transport,
			)
			.then((result) => {
				if (result) {
					if (removedTrackPending) {
						const tracks = [...this.state.tracks];
						tracks.splice(removedTrackPending.index, 0, removedTrackPending.track);
						this.setState({ tracks });
					}
					this.showEditErrorModal(result.type, result.playlistName, result.error);
				}
			});
	};

	private showEditErrorModal(operation: string, playlistName: string, errorMessage: string): void {
		this.viewModel.modalSlot?.slotted(() => {
			<Modal
				body={Strings.playlistEditErrorBody(operation, playlistName, errorMessage)}
				onClose={this.closeModalSlot}
				title={Strings.playlistEditErrorTitle()}
			/>;
		});
	}

	private handleCancelRemoveFromPlaylist = (): void => {
		const { removedTrackPending } = this.state;
		closeSlot(this.viewModel.modalSlot);

		if (!removedTrackPending) return;

		const tracks = [...this.state.tracks];
		tracks.splice(removedTrackPending.index, 0, removedTrackPending.track);

		this.setState({ removedTrackPending: null, tracks });
	};

	private handleDownloadTap = (): void => {
		const { downloadService, playlist, transport } = this.viewModel;
		const hasCacheableTrack = this.state.tracks.some((track) =>
			transport.getTrackCacheUrl(track.id),
		);
		if (!hasCacheableTrack) {
			return;
		}

		this.setState({ downloadState: 'downloading' });
		fireAndForget(
			'playlist-download',
			resolveDownloadTracks(transport, this.state.tracks, {
				resolveMissingLogos: true,
			}).then(({ artists, resolvedGenres, tracks }) => {
				if (tracks.length === 0) {
					return;
				}
				downloadService.downloadPlaylist({ artists, playlist, resolvedGenres, tracks });
			}),
		);
	};

	private handleHeaderAddToQueueTap = (): Promise<void> => {
		this.viewModel.playbackStore.addToQueue(this.state.tracks);
		return Promise.resolve();
	};

	// play and shuffle read from the transport, not state.tracks: how much of the playlist has
	// been paged in must not decide how much of it plays
	private handleHeaderPlayTap = (): void => {
		startPagedPlayback(this.viewModel.playbackStore, this.trackSource(), TRACK_PAGE_SIZE);
	};

	private handleHeaderShuffleTap = (): void => {
		startPagedPlayback(
			this.viewModel.playbackStore,
			this.trackSource({ sort: 'random' }),
			TRACK_PAGE_SIZE,
		);
	};

	// paging hangs off visibility, not layout: a layout edge only arrives when the trigger's frame
	// changes, which made paging depend on the view re-rendering for unrelated reasons
	private handleLoadMoreTriggerVisibility = (isVisible: boolean): void => {
		if (!isVisible) {
			return;
		}

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
	};

	private handleRemoveDownloadTap = (): void => {
		this.viewModel.downloadService.removePlaylistDownload(this.viewModel.playlist.id);
	};

	private handleTrackTap = (trackId: string): void => {
		const { playbackStore } = this.viewModel;
		const { tracks } = this.state;
		const trackIndex = tracks.findIndex((track) => track.id === trackId);
		if (trackIndex < 0) {
			return;
		}

		playbackStore.playTracks(tracks, trackIndex);
	};

	private resetAndLoadPlaylistData(): void {
		this.loadGeneration += 1;
		this.cancelInFlightReads();
		this.currentPage = 0;
		this.hasMoreTracks = true;
		this.isLoadingPage = false;
		this.triggeredAutoLoadForTrackCount = null;
		this.setState({ nextPageFailed: false });
		// keep any seeded/previous tracks visible during a revalidate; only blank to the spinner cold
		if (this.state.tracks.length === 0) {
			this.setState({
				hydratedPlaylist: null,
				isLoading: true,
				totalTrackCount: null,
				tracks: [],
			});
		}
		void this.loadNextPage(this.loadGeneration);
		void this.hydratePlaylistIfNeeded(this.loadGeneration);
	}

	private cacheKey(): string {
		return `playlist:${this.viewModel.playlist.id}`;
	}

	private handleRefresh = (): void => {
		if (this.state.isRefreshing) {
			return;
		}
		this.viewModel.viewCache.invalidate(this.cacheKey());
		this.setState({ isRefreshing: true });
		this.resetAndLoadPlaylistData();
	};

	private handleContentSizeChange = (size: ContentSizeChangeEvent): void => {
		this.dragAutoScroller.setContentHeight(size.height);
	};

	private handleScroll = (y: number): void => {
		this.dragAutoScroller.setOffset(y);
		this.headerCollapse.handleScroll(y);
	};

	private seedFromCache(): void {
		const cached = this.viewModel.viewCache.get<PlaylistCachePayload>(this.cacheKey());
		if (cached) {
			this.setState({ ...cached, isLoading: false });
			return;
		}
		void this.viewModel.viewCache.load<PlaylistCachePayload>(this.cacheKey()).then((disk) => {
			if (disk && !this.isDestroyed() && this.state.tracks.length === 0) {
				this.setState({ ...disk, isLoading: false });
			}
		});
	}

	private async hydratePlaylistIfNeeded(generation: number): Promise<void> {
		const { playlist, transport } = this.viewModel;
		if (playlist.imageUrl) {
			return;
		}
		let fetched: Playlist | null = null;
		try {
			const hydrateRead = transport.getPlaylist(playlist.id);
			this.inFlightHydrateRead = hydrateRead;
			fetched = await hydrateRead;
		} catch {
			return;
		}
		if (this.isDestroyed() || generation !== this.loadGeneration || !fetched) {
			return;
		}
		this.inFlightHydrateRead = undefined;
		this.setState({ hydratedPlaylist: fetched });
	}

	private syncDownloadState(): void {
		this.setState({
			downloadState: this.viewModel.downloadService.getPlaylistDownloadState(
				this.viewModel.playlist.id,
			),
		});
	}

	private async loadNextPage(generation = this.loadGeneration): Promise<void> {
		if (generation !== this.loadGeneration) {
			return;
		}

		if (this.isDestroyed() || this.isLoadingPage || !this.hasMoreTracks) {
			return;
		}

		const nextPage = this.currentPage + 1;
		const isFirstPage = nextPage === 1;
		this.isLoadingPage = true;
		if (!isFirstPage) {
			this.setState({ isLoadingNextPage: true, nextPageFailed: false });
		}

		try {
			const pageRead = this.fetchPage(nextPage);
			this.inFlightPageRead = pageRead;
			const result = await pageRead;
			if (this.isDestroyed() || generation !== this.loadGeneration) return;
			this.inFlightPageRead = undefined;

			const tracks = isFirstPage ? result.items : [...this.state.tracks, ...result.items];

			this.currentPage = nextPage;
			this.hasMoreTracks = result.hasMore;
			this.isLoadingPage = false;

			const totalTrackCount = isFirstPage
				? (result.totalCount ?? tracks.length)
				: this.state.totalTrackCount;
			if (isFirstPage) {
				this.viewModel.viewCache.store(this.cacheKey(), {
					hydratedPlaylist: this.state.hydratedPlaylist,
					totalTrackCount,
					tracks,
				});
			}
			this.setState({
				isLoading: false,
				isLoadingNextPage: false,
				isRefreshing: false,
				nextPageFailed: false,
				totalTrackCount,
				tracks,
			});
			this.viewModel.paletteQueue?.enqueuePlaylistTracks(result.items);
		} catch {
			if (this.isDestroyed() || generation !== this.loadGeneration) return;
			this.isLoadingPage = false;
			this.setState({ isLoading: false, isLoadingNextPage: false, nextPageFailed: true });
		}
	}

	private retryLoadMore = (): void => {
		this.triggeredAutoLoadForTrackCount = null;
		void this.loadNextPage();
	};

	private fetchPage(page: number): CancelablePromise<PlaylistTracksPage> {
		const { playlist, transport } = this.viewModel;
		return transport.getTracksByPlaylist(playlist.id, page, TRACK_PAGE_SIZE);
	}

	private trackSource(options?: { sort?: TrackPageSort }): TrackSource {
		const { playlist, transport } = this.viewModel;
		return (page, pageSize) => transport.getTracksByPlaylist(playlist.id, page, pageSize, options);
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
	root: new Style<Layout>({
		flexGrow: 1,
		width: '100%',
	}),
	scroll: new Style<ScrollView>({
		backgroundColor: theme.colors.bg,
		flexGrow: 1,
		padding: 8,
		paddingBottom: theme.padding.scrollBottom,
		paddingTop: theme.padding.scrollHeader(true),
		width: '100%',
	}),
};
