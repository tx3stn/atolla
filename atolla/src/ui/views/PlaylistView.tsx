import { ElementRef } from 'valdi_core/src/ElementRef';
import { Style } from 'valdi_core/src/Style';
import type { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';
import { DetachedSlotRenderer } from 'valdi_core/src/slot/DetachedSlotRenderer';
import { INavigatorPageVisibility } from 'valdi_navigation/src/INavigator';
import { NavigationPage } from 'valdi_navigation/src/NavigationPage';
import { NavigationPageStatefulComponent } from 'valdi_navigation/src/NavigationPageComponent';
import type { ScrollView, View } from 'valdi_tsx/src/NativeTemplateElements';
import type { Album } from '../../models/Album';
import type { FooterTab, HeaderTab } from '../../models/App';
import type { Playlist } from '../../models/Playlist';
import type { Track } from '../../models/Track';
import Strings from '../../Strings';
import type { DownloadService, DownloadState } from '../../services/DownloadService';
import type { ImageCache } from '../../services/ImageCache';
import type { PaletteGenerationQueue } from '../../services/PaletteGenerationQueue';
import type { PlaylistEditService } from '../../services/PlaylistEditService';
import { type PlaybackStore, shuffleArray } from '../../stores/Playback';
import { scrollPaddingBottom, theme, topInset } from '../../theme';
import type { Transport } from '../../transports/Transport';
import { retryResolve } from '../../utils/Async';
import { DetailHeader } from '../components/DetailHeader';
import { FooterNav } from '../components/FooterNav';
import { LibraryHeaderNav } from '../components/LibraryHeaderNav';
import { LoadingView } from '../components/LoadingView';
import { Modal } from '../components/Modal';
import { ScrollDragAutoScroller } from '../components/ScrollDragAutoScroller';
import type { ToastService } from '../components/ToastService';
import { TrackList, type TrackListEntry } from '../components/TrackList';
import { closeSlot } from '../flows/modalSlotFlow';
import { openTrackContextMenu } from '../flows/trackContextMenuController';
import type { NavBarContext } from '../NavBarContext';
import { AlbumView } from './AlbumView';
import { ArtistView } from './ArtistView';
import { resolveGenreImageUrls } from './GenreNavigationResolver';
import { TRACK_PAGE_SIZE } from './GridPagination';
import type { LibraryNavContext } from './LibraryView';

export interface PlaylistViewModel {
	animationsEnabled: boolean;
	downloadService: DownloadService;
	gridColumns: number;
	imageCache: ImageCache;
	isHeaderVisible?: boolean;
	modalSlot?: DetachedSlot;
	navBarContext?: NavBarContext;
	onExitFromSearchNavigation?: () => void;
	onHeaderVisibilityChange?: (isVisible: boolean) => void;
	onNavigateToArtist?: (artistId: string) => void;
	onNavigationContext?: (context: LibraryNavContext | null) => void;
	paletteQueue?: PaletteGenerationQueue;
	playbackStore: PlaybackStore;
	playlist: Playlist;
	playlistEditService?: PlaylistEditService;
	restoreHeaderOnDestroy?: boolean;
	toastService: ToastService;
	transport: Transport;
}

interface PlaylistState {
	artistLogoUrls: Array<string | null>;
	downloadState: DownloadState;
	isFooterVisible: boolean;
	isHeaderVisible: boolean;
	isLoading: boolean;
	removedTrackPending: { index: number; track: Track } | null;
	totalTrackCount: number | null;
	tracks: Array<Track>;
}

@NavigationPage(module)
export class PlaylistView extends NavigationPageStatefulComponent<
	PlaylistViewModel,
	PlaylistState
> {
	private currentPage = 0;
	private hasMoreTracks = true;
	private loadGeneration = 0;
	private isLoadingPage = false;
	private scrollRef = new ElementRef();
	private dragAutoScroller = new ScrollDragAutoScroller(this.scrollRef);
	private readonly setHeaderVisibility = (isVisible: boolean): void => {
		if (this.state.isHeaderVisible === isVisible) {
			return;
		}

		this.setState({ isHeaderVisible: isVisible });
		this.viewModel.onHeaderVisibilityChange?.(isVisible);
	};
	state: PlaylistState = {
		artistLogoUrls: [],
		downloadState: 'not_downloaded',
		isFooterVisible: false,
		isHeaderVisible: false,
		isLoading: true,
		removedTrackPending: null,
		totalTrackCount: null,
		tracks: [],
	};

	navigateToArtist = (artistId: string): void => {
		const {
			animationsEnabled,
			downloadService,
			gridColumns,
			imageCache,
			paletteQueue,
			playbackStore,
			transport,
		} = this.viewModel;
		transport.getArtist(artistId).then((artist) => {
			if (!artist) return;
			this.setHeaderVisibility(false);
			this.navigationController.push(
				ArtistView,
				{
					animationsEnabled,
					artist,
					downloadService,
					gridColumns,
					imageCache,
					isHeaderVisible: false,
					modalSlot: this.viewModel.navBarContext?.modalSlot ?? this.viewModel.modalSlot,
					navBarContext: this.viewModel.navBarContext,
					onHeaderVisibilityChange: this.viewModel.onHeaderVisibilityChange,
					onNavigationContext: this.viewModel.onNavigationContext,
					paletteQueue,
					playbackStore,
					restoreHeaderOnDestroy: false,
					toastService: this.viewModel.toastService,
					transport,
				},
				{},
				{ animated: animationsEnabled },
			);
		});
	};

	handleTrackLongPress = (track: Track): void => {
		const {
			animationsEnabled,
			downloadService,
			gridColumns,
			imageCache,
			paletteQueue,
			playbackStore,
			transport,
		} = this.viewModel;
		const modalSlot = this.viewModel.navBarContext?.modalSlot ?? this.viewModel.modalSlot;
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
						this.navigationController.push(
							AlbumView,
							{
								album,
								animationsEnabled,
								downloadService,
								gridColumns,
								imageCache,
								isHeaderVisible: false,
								modalSlot,
								navBarContext: this.viewModel.navBarContext,
								onHeaderVisibilityChange: this.viewModel.onHeaderVisibilityChange,
								paletteQueue,
								playbackStore,
								restoreHeaderOnDestroy: false,
								toastService: this.viewModel.toastService,
								transport,
							},
							{},
							{ animated: animationsEnabled },
						);
					}
				: undefined,
			onArtistTap:
				this.viewModel.onNavigateToArtist && artistId
					? () => this.viewModel.onNavigateToArtist?.(artistId)
					: undefined,
			onDismiss: () => {},
			onPlaylistCreated: (playlist) => {
				const { navBarContext, playlistEditService } = this.viewModel;
				this.navigationController.push(
					PlaylistView,
					{
						animationsEnabled,
						downloadService,
						gridColumns,
						imageCache,
						navBarContext,
						paletteQueue,
						playbackStore,
						playlist,
						playlistEditService,
						toastService: this.viewModel.toastService,
						transport,
					},
					{},
					{ animated: animationsEnabled },
				);
			},
			playbackStore,
			toastService: this.viewModel.toastService,
			transport,
		});
	};

	private closeModalSlot = (): void => {
		const modalSlot = this.viewModel.navBarContext?.modalSlot ?? this.viewModel.modalSlot;
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

	handleTrackSwipeRemove = (_trackId: string, entryIndex: number): void => {
		const { playlistEditService } = this.viewModel;
		if (!playlistEditService) return;
		const trackToRemove = this.state.tracks[entryIndex];
		if (!trackToRemove?.playlistItemId) {
			console.warn('[playlist] missing playlistItemId on remove, aborting');
			return;
		}
		const modalSlot = this.viewModel.navBarContext?.modalSlot ?? this.viewModel.modalSlot;
		const tracks = [...this.state.tracks];
		const artistLogoUrls = [...this.state.artistLogoUrls];
		const [removedTrack] = tracks.splice(entryIndex, 1);
		artistLogoUrls.splice(entryIndex, 1);

		this.setState({
			artistLogoUrls,
			removedTrackPending: { index: entryIndex, track: removedTrack },
			tracks,
		});

		modalSlot?.slotted(() => {
			<Modal
				animationsEnabled={this.viewModel.animationsEnabled}
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
		const modalSlot = this.viewModel.navBarContext?.modalSlot ?? this.viewModel.modalSlot;
		const { removedTrackPending } = this.state;
		closeSlot(modalSlot);
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
		const modalSlot = this.viewModel.navBarContext?.modalSlot ?? this.viewModel.modalSlot;
		modalSlot?.slotted(() => {
			<Modal
				body={Strings.playlistEditErrorBody(operation, playlistName, errorMessage)}
				onClose={this.closeModalSlot}
				title={Strings.playlistEditErrorTitle()}
			/>;
		});
	}

	private handleCancelRemoveFromPlaylist = (): void => {
		const modalSlot = this.viewModel.navBarContext?.modalSlot ?? this.viewModel.modalSlot;
		const { removedTrackPending } = this.state;
		closeSlot(modalSlot);

		if (!removedTrackPending) return;

		const tracks = [...this.state.tracks];
		const artistLogoUrls = [...this.state.artistLogoUrls];
		tracks.splice(removedTrackPending.index, 0, removedTrackPending.track);
		artistLogoUrls.splice(removedTrackPending.index, 0, null);

		this.setState({ artistLogoUrls, removedTrackPending: null, tracks });
	};

	handleDownloadTap = (): void => {
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

	handleRemoveDownloadTap = (): void => {
		this.viewModel.downloadService.removePlaylistDownload(this.viewModel.playlist.id);
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

	private syncDownloadState(): void {
		this.setState({
			downloadState: this.viewModel.downloadService.getPlaylistDownloadState(
				this.viewModel.playlist.id,
			),
		});
	}

	private resetAndLoadPlaylistData(): void {
		this.loadGeneration += 1;
		this.currentPage = 0;
		this.hasMoreTracks = true;
		this.isLoadingPage = false;
		this.setState({
			artistLogoUrls: [],
			isLoading: true,
			totalTrackCount: null,
			tracks: [],
		});
		void this.loadNextPage(this.loadGeneration);
	}

	onCreate(): void {
		this.navigationController.addPageVisibilityObserver((visibility) => {
			if (visibility === INavigatorPageVisibility.VISIBLE) {
				this.navigationController.disableDismissalGesture()();
			}
		});
		this.viewModel.onHeaderVisibilityChange?.(false);
		this.setHeaderVisibility(false);
		const { downloadService, playbackStore } = this.viewModel;
		this.registerDisposable(
			playbackStore.subscribe(() => {
				this.setState({ isFooterVisible: playbackStore.track !== null });
			}),
		);
		this.registerDisposable(
			downloadService.subscribe(() => {
				this.syncDownloadState();
			}),
		);
		this.setState({ isFooterVisible: playbackStore.track !== null });
		this.syncDownloadState();
		this.resetAndLoadPlaylistData();
	}

	onViewModelUpdate(prevViewModel?: PlaylistViewModel): void {
		if (!prevViewModel) {
			return;
		}

		if (
			this.viewModel.isHeaderVisible !== prevViewModel.isHeaderVisible &&
			this.viewModel.isHeaderVisible !== this.state.isHeaderVisible
		) {
			this.viewModel.onHeaderVisibilityChange?.(this.state.isHeaderVisible);
		}

		if (
			this.viewModel.transport !== prevViewModel.transport ||
			this.viewModel.playlist.id !== prevViewModel.playlist.id
		) {
			this.resetAndLoadPlaylistData();
		}
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
		return transport.getTracksByPlaylistPage(playlist.id, page, TRACK_PAGE_SIZE);
	}

	private handleFooterNavTabTap = (tab: FooterTab): void => {
		this.navigationController.pop();
		this.viewModel.navBarContext?.onFooterTabTap(tab);
	};

	private handleHeaderNavTabTap = (tab: HeaderTab): void => {
		this.viewModel.onHeaderVisibilityChange?.(true);
		this.navigationController.pop();
		this.viewModel.navBarContext?.header?.onTabTap(tab);
	};

	private handleHideHeaderGesture = (): void => {
		this.setHeaderVisibility(false);
	};

	private handleRevealHeaderGesture = (): void => {
		this.setHeaderVisibility(true);
	};

	onDestroy(): void {
		if (this.viewModel.restoreHeaderOnDestroy ?? true) {
			this.viewModel.onHeaderVisibilityChange?.(true);
		}
		this.viewModel.onExitFromSearchNavigation?.();
		this.viewModel.onNavigationContext?.(null);
	}

	onRender(): void {
		const { downloadState, isFooterVisible, isHeaderVisible, isLoading, totalTrackCount, tracks } =
			this.state;
		const { imageCache } = this.viewModel;
		const modalSlot = this.viewModel.navBarContext?.modalSlot ?? this.viewModel.modalSlot;

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
					onScroll={(event) => this.dragAutoScroller.setOffset(event.y)}
					ref={this.scrollRef}
					style={createScrollStyle(isFooterVisible, isHeaderVisible)}
				>
					<DetailHeader
						animationsEnabled={this.viewModel.animationsEnabled}
						artworkCategory='playlist_image'
						artworkSource={this.viewModel.playlist.imageUrl ?? null}
						downloadState={downloadState}
						fallbackText={this.viewModel.playlist.name}
						modalSlot={this.viewModel.navBarContext?.modalSlot ?? this.viewModel.modalSlot}
						onAddToQueue={tracks.length > 0 ? this.handleHeaderAddToQueueTap : undefined}
						onDownload={this.handleDownloadTap}
						onHideHeaderGesture={this.handleHideHeaderGesture}
						onPlay={tracks.length > 0 ? this.handleHeaderPlayTap : undefined}
						onRemoveDownload={this.handleRemoveDownloadTap}
						onRevealHeaderGesture={this.handleRevealHeaderGesture}
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
							animationsEnabled={this.viewModel.animationsEnabled}
							dragScroller={this.dragAutoScroller}
							imageCache={imageCache}
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
				{this.viewModel.navBarContext && (
					<FooterNav
						activeTab={this.viewModel.navBarContext.activeFooterTab}
						barColors={this.viewModel.navBarContext.barColors}
						downloadingCount={this.viewModel.navBarContext.downloadingCount}
						onFooterTabTap={this.handleFooterNavTabTap}
					/>
				)}
				{this.viewModel.navBarContext?.nowPlayingOverlaySlot && (
					<DetachedSlotRenderer detachedSlot={this.viewModel.navBarContext.nowPlayingOverlaySlot} />
				)}
				{modalSlot && <DetachedSlotRenderer detachedSlot={modalSlot} />}
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
