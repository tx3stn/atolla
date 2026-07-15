import { ElementRef } from 'valdi_core/src/ElementRef';
import { Style } from 'valdi_core/src/Style';
import type { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';
import { INavigatorPageVisibility } from 'valdi_navigation/src/INavigator';
import type { NavigationController } from 'valdi_navigation/src/NavigationController';
import { NavigationPage } from 'valdi_navigation/src/NavigationPage';
import { NavigationPageStatefulComponent } from 'valdi_navigation/src/NavigationPageComponent';
import type { ScrollView, View } from 'valdi_tsx/src/NativeTemplateElements';
import type { Album } from '../../models/Album';
import { HeaderTabs } from '../../models/App';
import type { Playlist } from '../../models/Playlist';
import type { Track } from '../../models/Track';
import Strings from '../../Strings';
import { backNavRouter } from '../../services/BackNavRouter';
import type { DownloadService, DownloadState } from '../../services/DownloadService';
import type { ImageCache } from '../../services/ImageCache';
import type { PaletteGenerationQueue } from '../../services/PaletteGenerationQueue';
import type { PlaylistEditService } from '../../services/PlaylistEditService';
import type { ToastService } from '../../services/ToastService';
import { HeaderCollapse, headerStore } from '../../stores/Header';
import { type PlaybackStore, shuffleArray } from '../../stores/Playback';
import type { Preferences } from '../../stores/Preferences';
import { theme } from '../../theme';
import type { Transport } from '../../transports/Transport';
import { retryResolve } from '../../utils/Async';
import { formatDuration } from '../../utils/Time';
import { DetailHeader } from '../components/DetailHeader';
import { LoadingView } from '../components/LoadingView';
import { Modal } from '../components/Modal';
import { ScrollDragAutoScroller } from '../components/ScrollDragAutoScroller';
import { TrackList, type TrackListEntry } from '../components/TrackList';
import { resolveGenreImageUrls } from '../flows/GenreNavigationResolver';
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
}

interface PlaylistState {
	artistLogoUrls: Array<string | null>;
	downloadState: DownloadState;
	hydratedPlaylist: Playlist | null;
	isLoading: boolean;
	removedTrackPending: { index: number; track: Track } | null;
	revision: number;
	totalTrackCount: number | null;
	tracks: Array<Track>;
}

@NavigationPage(module)
export class PlaylistView extends NavigationPageStatefulComponent<
	PlaylistViewModel,
	PlaylistState
> {
	state: PlaylistState = {
		artistLogoUrls: [],
		downloadState: 'not_downloaded',
		hydratedPlaylist: null,
		isLoading: true,
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
		this.syncDownloadState();
		this.resetAndLoadPlaylistData();
	}

	onRender(): void {
		const { downloadState, isLoading, totalTrackCount, tracks } = this.state;
		// self-heal: a playlist pushed without imageUrl gets the fetched one merged in for the header
		const playlist = { ...this.viewModel.playlist, ...(this.state.hydratedPlaylist ?? {}) };

		const entries: Array<TrackListEntry> = tracks.map((track) => ({
			artworkSource: track.albumImageUrl ?? null,
			id: track.id,
			meta: track.artistName ?? '',
			title: track.name,
			track,
		}));

		const totalDuration = tracks.reduce((sum, t) => sum + t.duration, 0);

		<layout accessibilityLabel='playlist-view' style={styles.root}>
			<view accessibilityId='playlist-view' style={styles.fullScreen}>
				<scroll
					onContentSizeChange={(size) => this.dragAutoScroller.setContentHeight(size.height)}
					onScroll={(event) => {
						this.dragAutoScroller.setOffset(event.y);
						this.headerCollapse.handleScroll(event.y);
					}}
					ref={this.scrollRef}
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
				</scroll>
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

	private currentPage = 0;
	private hasMoreTracks = true;
	private loadGeneration = 0;
	private isLoadingPage = false;
	private scrollRef = new ElementRef();
	private dragAutoScroller = new ScrollDragAutoScroller(this.scrollRef);
	private headerCollapse = new HeaderCollapse(headerStore);

	private bump = (): void => {
		this.setState({ revision: this.state.revision + 1 });
	};

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
		const prevArtistLogoUrls = this.state.artistLogoUrls;

		const tracks = [...prevTracks];
		const artistLogoUrls = [...prevArtistLogoUrls];
		const [movedTrack] = tracks.splice(fromEntryIndex, 1);
		const [movedLogo] = artistLogoUrls.splice(fromEntryIndex, 1);
		tracks.splice(toEntryIndex, 0, movedTrack);
		artistLogoUrls.splice(toEntryIndex, 0, movedLogo);

		this.setState({ artistLogoUrls, tracks });

		if (!movedTrack.playlistItemId) {
			console.warn('[playlist] missing playlistItemId on move, aborting reorder');
			this.setState({ artistLogoUrls: prevArtistLogoUrls, tracks: prevTracks });
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
					this.setState({ artistLogoUrls: prevArtistLogoUrls, tracks: prevTracks });
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
		const artistLogoUrls = [...this.state.artistLogoUrls];
		const [removedTrack] = tracks.splice(entryIndex, 1);
		artistLogoUrls.splice(entryIndex, 1);

		this.setState({
			artistLogoUrls,
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
						const artistLogoUrls = [...this.state.artistLogoUrls];
						tracks.splice(removedTrackPending.index, 0, removedTrackPending.track);
						artistLogoUrls.splice(removedTrackPending.index, 0, null);
						this.setState({ artistLogoUrls, tracks });
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
		const artistLogoUrls = [...this.state.artistLogoUrls];
		tracks.splice(removedTrackPending.index, 0, removedTrackPending.track);
		artistLogoUrls.splice(removedTrackPending.index, 0, null);

		this.setState({ artistLogoUrls, removedTrackPending: null, tracks });
	};

	private handleDownloadTap = (): void => {
		const { downloadService, playlist, transport } = this.viewModel;
		const tracks = this.state.tracks
			.map((track, i) => {
				const streamUrl = transport.getTrackCacheUrl(track.id);
				if (!streamUrl) {
					return null;
				}

				return {
					artistLogoUrl: this.state.artistLogoUrls[i] ?? null,
					streamUrl,
					track,
				};
			})
			.filter(
				(t): t is { artistLogoUrl: string | null; streamUrl: string; track: Track } => t !== null,
			);

		if (tracks.length === 0) {
			return;
		}

		const uniqueArtistIds = Array.from(
			new Set(
				tracks
					.map(({ track }) => track.artistId)
					.filter((artistId): artistId is string => artistId != null && artistId.length > 0),
			),
		);

		const allGenres = tracks.flatMap(({ track }) => track.genres ?? []);

		this.setState({ downloadState: 'downloading' });
		Promise.all([
			Promise.all(
				uniqueArtistIds.map((artistId) =>
					retryResolve(() => transport.getArtist(artistId)).catch(() => null),
				),
			),
			resolveGenreImageUrls(transport, allGenres),
		]).then(([artistResults, resolvedGenres]) => {
			downloadService.downloadPlaylist({
				artists: artistResults.filter(
					(artist): artist is NonNullable<typeof artist> => artist != null,
				),
				playlist,
				resolvedGenres,
				tracks,
			});
		});
	};

	private handleHeaderAddToQueueTap = (): Promise<void> => {
		this.viewModel.playbackStore.addToQueue(this.state.tracks);
		return Promise.resolve();
	};

	private handleHeaderPlayTap = (): void => {
		const { playbackStore } = this.viewModel;
		const { artistLogoUrls, tracks } = this.state;
		playbackStore.playWithArtistLogos(tracks, artistLogoUrls);
	};

	private handleHeaderShuffleTap = (): void => {
		const { artistLogoUrls, tracks } = this.state;
		const indices = shuffleArray(tracks.map((_, i) => i));

		this.viewModel.playbackStore.playWithArtistLogos(
			indices.map((i) => tracks[i]),
			indices.map((i) => artistLogoUrls[i] ?? null),
		);
	};

	private handleRemoveDownloadTap = (): void => {
		this.viewModel.downloadService.removePlaylistDownload(this.viewModel.playlist.id);
	};

	private handleTrackTap = (trackId: string): void => {
		const { playbackStore } = this.viewModel;
		const { artistLogoUrls, tracks } = this.state;
		const trackIndex = this.state.tracks.findIndex((track) => track.id === trackId);
		if (trackIndex < 0) {
			return;
		}

		playbackStore.playWithArtistLogos(tracks, artistLogoUrls, trackIndex);
	};

	private resetAndLoadPlaylistData(): void {
		this.loadGeneration += 1;
		this.currentPage = 0;
		this.hasMoreTracks = true;
		this.isLoadingPage = false;
		this.setState({
			artistLogoUrls: [],
			hydratedPlaylist: null,
			isLoading: true,
			totalTrackCount: null,
			tracks: [],
		});
		void this.loadNextPage(this.loadGeneration);
		void this.hydratePlaylistIfNeeded(this.loadGeneration);
	}

	private async hydratePlaylistIfNeeded(generation: number): Promise<void> {
		const { playlist, transport } = this.viewModel;
		if (playlist.imageUrl) {
			return;
		}
		let fetched: Playlist | null = null;
		try {
			fetched = await transport.getPlaylist(playlist.id);
		} catch {
			return;
		}
		if (this.isDestroyed() || generation !== this.loadGeneration || !fetched) {
			return;
		}
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

		try {
			const result = await this.fetchPage(nextPage);
			if (this.isDestroyed() || generation !== this.loadGeneration) return;

			const artistLogoUrls = await Promise.all(
				result.items.map((t) =>
					t.artistId ? this.viewModel.transport.getArtistLogoUrl(t.artistId) : null,
				),
			);
			if (this.isDestroyed() || generation !== this.loadGeneration) return;

			const tracks = isFirstPage ? result.items : [...this.state.tracks, ...result.items];
			const allArtistLogoUrls = isFirstPage
				? artistLogoUrls
				: [...this.state.artistLogoUrls, ...artistLogoUrls];

			this.currentPage = nextPage;
			this.hasMoreTracks = result.hasMore;
			this.isLoadingPage = false;

			const totalTrackCount = isFirstPage
				? (result.totalCount ?? tracks.length)
				: this.state.totalTrackCount;
			this.setState({
				artistLogoUrls: allArtistLogoUrls,
				isLoading: false,
				totalTrackCount,
				tracks,
			});
			this.viewModel.paletteQueue?.enqueuePlaylistTracks(result.items);

			if (result.hasMore) {
				void this.loadNextPage(generation);
			}
		} catch {
			if (this.isDestroyed() || generation !== this.loadGeneration) return;
			this.isLoadingPage = false;
			this.setState({ isLoading: false });
		}
	}

	private fetchPage(
		page: number,
	): Promise<{ hasMore: boolean; items: Array<Track>; totalCount?: number }> {
		const { playlist, transport } = this.viewModel;
		return Promise.resolve(transport.getTracksByPlaylist(playlist.id, page, TRACK_PAGE_SIZE));
	}
}

const styles = {
	fullScreen: new Style<View>({
		height: '100%',
		position: 'relative',
		width: '100%',
	}),
	root: new Style({
		backgroundColor: theme.colors.bg,
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
