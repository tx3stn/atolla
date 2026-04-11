// @ts-nocheck
import { Style } from 'valdi_core/src/Style';
import { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';
import { DetachedSlotRenderer } from 'valdi_core/src/slot/DetachedSlotRenderer';
import { NavigationPage } from 'valdi_navigation/src/NavigationPage';
import { NavigationPageStatefulComponent } from 'valdi_navigation/src/NavigationPageComponent';
import type { Playlist } from '../../models/Playlist';
import type { Track } from '../../models/Track';
import type { DownloadService, DownloadState } from '../../services/DownloadService';
import type { ImageCache } from '../../services/ImageCache';
import type { PaletteGenerationQueue } from '../../services/PaletteGenerationQueue';
import { type PlaybackStore, shuffleArray } from '../../stores/Playback';
import { scrollPaddingBottom, theme } from '../../theme';
import type { Transport } from '../../transports/Transport';
import { DetailHeader } from '../components/DetailHeader';
import { LoadingView } from '../components/LoadingView';
import { TrackContextMenu } from '../components/TrackContextMenu';
import { TrackList, type TrackListEntry } from '../components/TrackList';

const TRACK_PAGE_SIZE = 50;

export interface PlaylistViewModel {
	animationsEnabled: boolean;
	downloadService: DownloadService;
	gridColumns: number;
	imageCache: ImageCache;
	onExitFromSearchNavigation?: () => void;
	onNavigateToArtist?: (artistId: string) => void;
	paletteQueue?: PaletteGenerationQueue;
	playbackStore: PlaybackStore;
	playlist: Playlist;
	transport: Transport;
}

interface PlaylistState {
	artistLogoUrls: Array<string | null>;
	contextMenuTrack: Track | null;
	downloadState: DownloadState;
	isFooterVisible: boolean;
	isLoading: boolean;
	totalTrackCount: number | null;
	tracks: Array<Track>;
}

@NavigationPage(module)
export class PlaylistView extends NavigationPageStatefulComponent<
	PlaylistViewModel,
	PlaylistState
> {
	private modalSlot = new DetachedSlot();
	private allTracks: Array<Track> | null = null;
	private currentPage = 0;
	private hasBeenDestroyed = false;
	private hasMoreTracks = true;
	private isLoadingPage = false;
	private unsubscribePlayback?: () => void;
	private unsubscribeDownloads?: () => void;

	state: PlaylistState = {
		artistLogoUrls: [],
		contextMenuTrack: null,
		downloadState: 'not_downloaded',
		isFooterVisible: false,
		isLoading: true,
		totalTrackCount: null,
		tracks: [],
	};

	navigateToArtist = (artistId: string): void => {
		const { animationsEnabled, gridColumns, imageCache, paletteQueue, playbackStore, transport } =
			this.viewModel;
		transport.getArtist(artistId).then((artist) => {
			if (!artist) return;
			this.navigationController.push(
				ArtistView,
				{
					animationsEnabled,
					artist,
					gridColumns,
					imageCache,
					paletteQueue,
					playbackStore,
					transport,
				},
				{},
				{ animated: animationsEnabled },
			);
		});
	};

	handleTrackLongPress = (track: Track): void => {
		this.setState({ contextMenuTrack: track });
	};

	handleContextMenuDismiss = (): void => {
		this.setState({ contextMenuTrack: null });
	};

	handleDownloadTap = (): void => {
		const { downloadService, playlist, transport } = this.viewModel;
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

			Promise.all(
				uniqueArtistIds.map((artistId) => transport.getArtist(artistId).catch(() => null)),
			).then((artists) => {
				downloadService.downloadPlaylist({
					artists: artists.filter((artist): artist is NonNullable<typeof artist> => artist != null),
					playlist,
					tracks,
				});
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

	onCreate(): void {
		this.hasBeenDestroyed = false;
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

	private async loadNextPage(): Promise<void> {
		if (this.hasBeenDestroyed || this.isLoadingPage || !this.hasMoreTracks) {
			return;
		}

		const nextPage = this.currentPage + 1;
		const isFirstPage = nextPage === 1;
		this.isLoadingPage = true;

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
				void this.loadNextPage();
			}
		} catch {
			if (this.hasBeenDestroyed) return;
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

	onDestroy(): void {
		this.hasBeenDestroyed = true;
		this.unsubscribePlayback?.();
		this.unsubscribeDownloads?.();
		this.viewModel.onExitFromSearchNavigation?.();
	}

	onRender(): void {
		const { contextMenuTrack, downloadState, isFooterVisible, isLoading, totalTrackCount, tracks } =
			this.state;
		const { imageCache, onNavigateToArtist, playbackStore, transport } = this.viewModel;

		const entries: Array<TrackListEntry> = tracks.map((track) => ({
			artworkSource: track.albumImageUrl ?? null,
			id: track.id,
			meta: track.artistName,
			title: track.name,
			track,
		}));

		const totalDuration = tracks.reduce((sum, t) => sum + t.duration, 0);

		<layout
			accessibilityLabel='playlist-view'
			contentDescription='playlist-view'
			style={styles.root}
		>
			<scroll style={createScrollStyle(isFooterVisible)}>
				<DetailHeader
					animationsEnabled={this.viewModel.animationsEnabled}
					artworkCategory='playlist_image'
					artworkSource={this.viewModel.playlist.imageUrl ?? null}
					downloadState={downloadState}
					fallbackText={this.viewModel.playlist.name}
					imageCache={this.viewModel.imageCache}
					modalSlot={this.modalSlot}
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

function createScrollStyle(isFooterVisible: boolean): Style {
	return isFooterVisible ? scrollStyles.withFooter : scrollStyles.withoutFooter;
}

const scrollStyles = {
	withFooter: new Style({
		backgroundColor: theme.colors.bg,
		flexGrow: 1,
		padding: 8,
		paddingBottom: scrollPaddingBottom(true),
		paddingTop: theme.headerHeight,
		width: '100%',
	}),
	withoutFooter: new Style({
		backgroundColor: theme.colors.bg,
		flexGrow: 1,
		padding: 8,
		paddingBottom: scrollPaddingBottom(false),
		paddingTop: theme.headerHeight,
		width: '100%',
	}),
};
