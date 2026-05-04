import { Style } from 'valdi_core/src/Style';
import type { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';
import { DetachedSlotRenderer } from 'valdi_core/src/slot/DetachedSlotRenderer';
import { INavigatorPageVisibility } from 'valdi_navigation/src/INavigator';
import { NavigationPage } from 'valdi_navigation/src/NavigationPage';
import { NavigationPageStatefulComponent } from 'valdi_navigation/src/NavigationPageComponent';
import type { ScrollView, View } from 'valdi_tsx/src/NativeTemplateElements';
import type { Album } from '../../models/Album';
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
import { DetailHeader } from '../components/DetailHeader';
import { FooterNav } from '../components/FooterNav';
import type { FooterTab } from '../components/FooterTab';
import type { HeaderTab } from '../components/HeaderTabs';
import { LibraryHeaderNav } from '../components/LibraryHeaderNav';
import { LoadingView } from '../components/LoadingView';
import { Modal } from '../components/Modal';
import { TrackContextMenu } from '../components/TrackContextMenu';
import { TrackList, type TrackListEntry } from '../components/TrackList';
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
	playlistEditService: PlaylistEditService;
	restoreHeaderOnDestroy?: boolean;
	transport: Transport;
}

interface PlaylistState {
	artistLogoUrls: Array<string | null>;
	contextMenuTrack: Track | null;
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
	private allTracks: Array<Track> | null = null;
	private currentPage = 0;
	private hasBeenDestroyed = false;
	private hasMoreTracks = true;
	private loadGeneration = 0;
	private isLoadingPage = false;
	private unsubscribePlayback?: () => void;
	private unsubscribeDownloads?: () => void;
	private readonly setHeaderVisibility = (isVisible: boolean): void => {
		if (this.state.isHeaderVisible === isVisible) {
			return;
		}

		this.setState({ isHeaderVisible: isVisible });
		this.viewModel.onHeaderVisibilityChange?.(isVisible);
	};
	state: PlaylistState = {
		artistLogoUrls: [],
		contextMenuTrack: null,
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
					transport,
				},
				{},
				{ animated: animationsEnabled },
			);
		});
	};

	handleTrackLongPress = (track: Track): void => {
		this.setState({ contextMenuTrack: track });
		const modalSlot = this.viewModel.navBarContext?.modalSlot ?? this.viewModel.modalSlot;
		const { animationsEnabled, imageCache, onNavigateToArtist, playbackStore, transport } =
			this.viewModel;
		modalSlot?.slotted(() => {
			<TrackContextMenu
				animationsEnabled={animationsEnabled}
				imageCache={imageCache}
				onAlbumTap={track.albumId ? this.handleContextMenuAlbumTap : undefined}
				onArtistTap={
					onNavigateToArtist && track.artistId ? this.handleContextMenuArtistTap : undefined
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
		const {
			animationsEnabled,
			downloadService,
			gridColumns,
			imageCache,
			paletteQueue,
			playbackStore,
			transport,
		} = this.viewModel;
		this.navigationController.push(
			AlbumView,
			{
				album,
				animationsEnabled,
				downloadService,
				gridColumns,
				imageCache,
				isHeaderVisible: false,
				modalSlot: this.viewModel.navBarContext?.modalSlot ?? this.viewModel.modalSlot,
				navBarContext: this.viewModel.navBarContext,
				onHeaderVisibilityChange: this.viewModel.onHeaderVisibilityChange,
				paletteQueue,
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

	handleTrackReorder = (fromEntryIndex: number, toEntryIndex: number): void => {
		const { playlist, playlistEditService } = this.viewModel;
		const tracks = [...this.state.tracks];
		const artistLogoUrls = [...this.state.artistLogoUrls];
		const [movedTrack] = tracks.splice(fromEntryIndex, 1);
		const [movedLogo] = artistLogoUrls.splice(fromEntryIndex, 1);
		tracks.splice(toEntryIndex, 0, movedTrack);
		artistLogoUrls.splice(toEntryIndex, 0, movedLogo);

		if (this.allTracks) {
			const allTracks = [...this.allTracks];
			const [movedAll] = allTracks.splice(fromEntryIndex, 1);
			allTracks.splice(toEntryIndex, 0, movedAll);
			this.allTracks = allTracks;
		}

		this.setState({ artistLogoUrls, tracks });
		playlistEditService.enqueue({
			playlistId: playlist.id,
			toIndex: toEntryIndex,
			trackId: movedTrack.id,
			type: 'move',
		});
	};

	handleTrackSwipeRemove = (_trackId: string, entryIndex: number): void => {
		const { playlist, playlistEditService } = this.viewModel;
		const modalSlot = this.viewModel.navBarContext?.modalSlot ?? this.viewModel.modalSlot;
		const tracks = [...this.state.tracks];
		const artistLogoUrls = [...this.state.artistLogoUrls];
		const [removedTrack] = tracks.splice(entryIndex, 1);
		artistLogoUrls.splice(entryIndex, 1);

		if (this.allTracks) {
			const allTracks = [...this.allTracks];
			allTracks.splice(entryIndex, 1);
			this.allTracks = allTracks;
		}

		this.setState({
			artistLogoUrls,
			removedTrackPending: { index: entryIndex, track: removedTrack },
			tracks,
		});

		modalSlot?.slotted(() => {
			<Modal
				body={Strings.removeFromPlaylistBody(removedTrack.name)}
				cancelAccessibilityLabel='playlist-remove-cancel-btn'
				confirmAccessibilityLabel='playlist-remove-confirm-btn'
				modalAccessibilityLabel='playlist-remove-modal'
				onClose={this.handleCancelRemoveFromPlaylist}
				onConfirm={() => {
					this.handleConfirmRemoveFromPlaylist(playlist.id, removedTrack.id, playlistEditService);
				}}
				title={Strings.removeFromPlaylistTitle()}
			/>;
		});
	};

	private handleConfirmRemoveFromPlaylist = (
		playlistId: string,
		trackId: string,
		playlistEditService: PlaylistEditService,
	): void => {
		const modalSlot = this.viewModel.navBarContext?.modalSlot ?? this.viewModel.modalSlot;
		modalSlot?.slotted(() => {});
		this.setState({ removedTrackPending: null });
		playlistEditService.enqueue({ playlistId, trackId, type: 'remove' });
	};

	private handleCancelRemoveFromPlaylist = (): void => {
		const modalSlot = this.viewModel.navBarContext?.modalSlot ?? this.viewModel.modalSlot;
		const { removedTrackPending } = this.state;
		modalSlot?.slotted(() => {});

		if (!removedTrackPending) return;

		const tracks = [...this.state.tracks];
		const artistLogoUrls = [...this.state.artistLogoUrls];
		tracks.splice(removedTrackPending.index, 0, removedTrackPending.track);
		artistLogoUrls.splice(removedTrackPending.index, 0, null);

		if (this.allTracks) {
			const allTracks = [...this.allTracks];
			allTracks.splice(removedTrackPending.index, 0, removedTrackPending.track);
			this.allTracks = allTracks;
		}

		this.setState({ artistLogoUrls, removedTrackPending: null, tracks });
	};

	handleDownloadTap = (): void => {
		const { downloadService, playlist, transport } = this.viewModel;
		const tracks = this.state.tracks
			.map((track, i) => {
				const streamUrl = transport.getTrackCacheUrl?.(track.id);
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
				uniqueArtistIds.map((artistId) => transport.getArtist(artistId).catch(() => null)),
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

	handleContextMenuArtistTap = (): void => {
		const artistId = this.state.contextMenuTrack?.artistId;
		if (!artistId) {
			return;
		}

		this.viewModel.onNavigateToArtist?.(artistId);
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
		this.allTracks = null;
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

		if (this.hasBeenDestroyed || this.isLoadingPage || !this.hasMoreTracks) {
			return;
		}

		const nextPage = this.currentPage + 1;
		const isFirstPage = nextPage === 1;
		this.isLoadingPage = true;

		try {
			const result = await this.fetchPage(nextPage);
			if (this.hasBeenDestroyed || generation !== this.loadGeneration) return;

			const artistLogoUrls = await Promise.all(
				result.items.map((t) =>
					t.artistId ? this.viewModel.transport.getArtistLogoUrl(t.artistId) : null,
				),
			);
			if (this.hasBeenDestroyed || generation !== this.loadGeneration) return;

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
			if (this.hasBeenDestroyed || generation !== this.loadGeneration) return;
			this.isLoadingPage = false;
			this.setState({ isLoading: false });
		}
	}

	private fetchPage(
		page: number,
	): Promise<{ hasMore: boolean; items: Array<Track>; totalCount?: number }> {
		const { playlist, transport } = this.viewModel;
		if (transport.getTracksByPlaylistPage) {
			return transport.getTracksByPlaylistPage(playlist.id, page, TRACK_PAGE_SIZE);
		}

		if (!this.allTracks) {
			return transport.getTracksByPlaylist(playlist.id).then((tracks) => {
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
		this.unsubscribePlayback?.();
		this.unsubscribeDownloads?.();
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

		const entries: Array<TrackListEntry> = tracks.map((track) => ({
			artworkSource: track.albumImageUrl ?? null,
			id: track.id,
			meta: track.artistName ?? '',
			title: track.name,
			track,
		}));

		const totalDuration = tracks.reduce((sum, t) => sum + t.duration, 0);

		<layout accessibilityLabel='playlist-view' style={styles.root}>
			<view style={styles.fullScreen}>
				<scroll style={createScrollStyle(isFooterVisible, isHeaderVisible)}>
					<DetailHeader
						animationsEnabled={this.viewModel.animationsEnabled}
						artworkCategory='playlist_image'
						artworkSource={this.viewModel.playlist.imageUrl ?? null}
						downloadState={downloadState}
						fallbackText={this.viewModel.playlist.name}
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
							onTrackReorder={this.handleTrackReorder}
							onTrackSwipeRemove={this.handleTrackSwipeRemove}
							onTrackTap={this.handleTrackTap}
							showDragHandles={true}
							tracks={entries}
						/>
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
