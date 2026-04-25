import { Style } from 'valdi_core/src/Style';
import { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';
import { DetachedSlotRenderer } from 'valdi_core/src/slot/DetachedSlotRenderer';
import { NavigationPage } from 'valdi_navigation/src/NavigationPage';
import { NavigationPageStatefulComponent } from 'valdi_navigation/src/NavigationPageComponent';
import type { ScrollView } from 'valdi_tsx/src/NativeTemplateElements';
import type { Album } from '../../models/Album';
import type { Artist } from '../../models/Artist';
import type { Genre } from '../../models/Genre';
import type { Track } from '../../models/Track';
import type { DownloadService, DownloadState } from '../../services/DownloadService';
import type { ImageCache } from '../../services/ImageCache';
import type { PaletteGenerationQueue } from '../../services/PaletteGenerationQueue';
import { type PlaybackStore, shuffleArray } from '../../stores/Playback';
import { scrollPaddingBottom, theme } from '../../theme';
import type { Transport } from '../../transports/Transport';
import { BioSection } from '../components/BioSection';
import { DetailHeader } from '../components/DetailHeader';
import { GenrePills } from '../components/GenrePills';
import { normalizeGenres } from '../components/GenrePillsData';
import { LoadingView } from '../components/LoadingView';
import { TrackContextMenu } from '../components/TrackContextMenu';
import { TrackList, type TrackListEntry } from '../components/TrackList';
import { ArtistView } from './ArtistView';
import { resolveGenreForNavigation } from './GenreNavigationResolver';
import { GenreView } from './GenreView';
import type { LibraryNavContext } from './LibraryView';

export interface AlbumViewModel {
	album: Album;
	animationsEnabled: boolean;
	downloadService: DownloadService;
	gridColumns: number;
	imageCache: ImageCache;
	isHeaderVisible?: boolean;
	onExitFromSearchNavigation?: () => void;
	onHeaderVisibilityChange?: (isVisible: boolean) => void;
	onNavigationContext?: (context: LibraryNavContext | null) => void;
	paletteQueue?: PaletteGenerationQueue;
	playbackStore: PlaybackStore;
	restoreHeaderOnDestroy?: boolean;
	transport: Transport;
}

interface AlbumState {
	artist: Artist | null;
	artistLogoUrl: string | null;
	contextMenuTrack: Track | null;
	downloadState: DownloadState;
	isFooterVisible: boolean;
	isHeaderVisible: boolean;
	isLoading: boolean;
	tracks: Array<Track>;
}

@NavigationPage(module)
export class AlbumView extends NavigationPageStatefulComponent<AlbumViewModel, AlbumState> {
	private modalSlot = new DetachedSlot();
	private hasBeenDestroyed = false;
	private loadGeneration = 0;
	private unsubscribePlayback?: () => void;
	private unsubscribeDownloads?: () => void;
	private readonly setHeaderVisibility = (isVisible: boolean): void => {
		if (this.state.isHeaderVisible === isVisible) {
			return;
		}

		this.setState({ isHeaderVisible: isVisible });
		this.viewModel.onHeaderVisibilityChange?.(isVisible);
	};
	state: AlbumState = {
		artist: null,
		artistLogoUrl: null,
		contextMenuTrack: null,
		downloadState: 'not_downloaded',
		isFooterVisible: false,
		isHeaderVisible: false,
		isLoading: true,
		tracks: [],
	};

	handleArtistLogoTap = (): void => {
		const {
			album,
			animationsEnabled,
			downloadService,
			gridColumns,
			imageCache,
			paletteQueue,
			playbackStore,
			transport,
		} = this.viewModel;
		const navigationController = this.navigationController;
		const pushArtistView = (artist: Artist) => {
			this.setHeaderVisibility(false);
			navigationController.push(
				ArtistView,
				{
					animationsEnabled,
					artist,
					downloadService,
					gridColumns,
					imageCache,
					isHeaderVisible: false,
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

		if (this.state.artist) {
			pushArtistView(this.state.artist);
			return;
		}

		transport.getArtist(album.artistId).then((artist) => {
			const resolvedArtist =
				artist ??
				({
					id: album.artistId,
					logoUrl: this.state.artistLogoUrl ?? null,
					name: album.artistName,
				} as Artist);
			this.setState({ artist: resolvedArtist, artistLogoUrl: resolvedArtist.logoUrl ?? null });
			pushArtistView(resolvedArtist);
		});
	};

	handleTrackTap = (trackId: string): void => {
		if (this.state.tracks.length === 0) return;

		const trackIndex = this.state.tracks.findIndex((track) => track.id === trackId);
		if (trackIndex < 0) {
			return;
		}

		const { album, playbackStore } = this.viewModel;
		playbackStore.play(this.state.tracks, album, trackIndex);
		playbackStore.setArtistLogoUrl(this.state.artistLogoUrl);
	};

	handleHeaderPlayTap = (): void => {
		if (this.state.tracks.length === 0) return;
		const { album, playbackStore } = this.viewModel;
		playbackStore.play(this.state.tracks, album);
		playbackStore.setArtistLogoUrl(this.state.artistLogoUrl);
	};

	handleTrackLongPress = (track: Track): void => {
		this.setState({ contextMenuTrack: track });
	};

	handleContextMenuDismiss = (): void => {
		this.setState({ contextMenuTrack: null });
	};

	handleHeaderShuffleTap = (): void => {
		if (this.state.tracks.length === 0) return;
		const { album, playbackStore } = this.viewModel;
		playbackStore.play(shuffleArray(this.state.tracks), album);
		playbackStore.setArtistLogoUrl(this.state.artistLogoUrl);
	};

	handleDownloadTap = (): void => {
		const { album, downloadService, transport } = this.viewModel;
		const tracks = this.state.tracks
			.map((track) => {
				const streamUrl = transport.getTrackCacheUrl?.(track.id);
				return streamUrl ? { streamUrl, track } : null;
			})
			.filter((t): t is { streamUrl: string; track: Track } => t !== null);

		const existingLogoUrl = this.state.artistLogoUrl;
		if (existingLogoUrl) {
			downloadService.downloadAlbum({
				album,
				artistImageUrl: this.state.artist?.imageUrl ?? null,
				artistLogoUrl: existingLogoUrl,
				tracks,
			});
			return;
		}

		transport
			.getArtistLogoUrl(album.artistId)
			.then((resolvedLogoUrl) => {
				if (resolvedLogoUrl) {
					this.setState({ artistLogoUrl: resolvedLogoUrl });
				}
				downloadService.downloadAlbum({
					album,
					artistImageUrl: this.state.artist?.imageUrl ?? null,
					artistLogoUrl: resolvedLogoUrl,
					tracks,
				});
			})
			.catch(() => {
				downloadService.downloadAlbum({
					album,
					artistImageUrl: this.state.artist?.imageUrl ?? null,
					artistLogoUrl: null,
					tracks,
				});
			});
	};

	handleRemoveDownloadTap = (): void => {
		this.viewModel.downloadService.removeAlbumDownload(this.viewModel.album.id);
	};

	handleHeaderAddToQueueTap = (): Promise<void> => {
		if (this.state.tracks.length === 0) return Promise.resolve();
		this.viewModel.playbackStore.addToQueue(this.state.tracks);
		return Promise.resolve();
	};

	handleGenreTap = (genre: Genre): void => {
		void this.navigateToGenre(genre);
	};

	private async navigateToGenre(genre: Genre): Promise<void> {
		const { animationsEnabled, downloadService, imageCache, playbackStore, transport } =
			this.viewModel;
		const navigationController = this.navigationController;
		const resolvedGenre = await resolveGenreForNavigation(transport, genre);

		if (this.hasBeenDestroyed) {
			return;
		}

		this.viewModel.onNavigationContext?.({ genre: resolvedGenre, kind: 'genre' });
		this.setHeaderVisibility(false);
		navigationController.push(
			GenreView,
			{
				animationsEnabled,
				downloadService,
				genre: resolvedGenre,
				imageCache,
				onHeaderVisibilityChange: this.viewModel.onHeaderVisibilityChange,
				playbackStore,
				restoreHeaderOnDestroy: false,
				transport,
			},
			{},
			{ animated: animationsEnabled },
		);
	}

	private syncDownloadState(): void {
		this.setState({
			downloadState: this.viewModel.downloadService.getAlbumDownloadState(this.viewModel.album.id),
		});
	}

	private loadAlbumData(): void {
		const generation = this.loadGeneration + 1;
		this.loadGeneration = generation;

		const { album, paletteQueue, transport } = this.viewModel;
		paletteQueue?.prioritize(album.imageUrl);
		this.setState({ isLoading: true });

		Promise.all([
			transport
				.getTracksByAlbum(album.id)
				.then((v) => ({ status: 'fulfilled' as const, value: v }))
				.catch((r) => ({ reason: r, status: 'rejected' as const })),
			transport
				.getArtist(album.artistId)
				.then((v) => ({ status: 'fulfilled' as const, value: v }))
				.catch((r) => ({ reason: r, status: 'rejected' as const })),
		]).then(([tracksResult, artistResult]) => {
			if (this.hasBeenDestroyed || generation !== this.loadGeneration) {
				return;
			}

			const tracks = tracksResult.status === 'fulfilled' ? tracksResult.value : [];
			const artist = artistResult.status === 'fulfilled' ? artistResult.value : null;
			const logoUrl = artist?.logoUrl || null;

			this.setState({
				artist: artist ?? null,
				artistLogoUrl: logoUrl,
				isLoading: false,
				tracks,
			});
		});
	}

	onCreate(): void {
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
		this.loadAlbumData();
	}

	onViewModelUpdate(prevViewModel?: AlbumViewModel): void {
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
			this.viewModel.album.id !== prevViewModel.album.id
		) {
			this.loadAlbumData();
		}
	}

	onDestroy(): void {
		this.hasBeenDestroyed = true;
		this.unsubscribePlayback?.();
		this.unsubscribeDownloads?.();
		if (this.viewModel.restoreHeaderOnDestroy ?? true) {
			this.viewModel.onHeaderVisibilityChange?.(true);
		} else {
			this.viewModel.onHeaderVisibilityChange?.(false);
		}
		this.viewModel.onExitFromSearchNavigation?.();
		this.viewModel.onNavigationContext?.(null);
	}

	onRender(): void {
		const {
			artistLogoUrl,
			contextMenuTrack,
			downloadState,
			isFooterVisible,
			isHeaderVisible,
			isLoading,
			tracks,
		} = this.state;
		const { album, animationsEnabled, imageCache, playbackStore, transport } = this.viewModel;
		const albumGenres = normalizeGenres(album.genres);

		const entries: Array<TrackListEntry> = tracks.map((track) => ({
			id: track.id,
			leadingLabel: track.trackNumber != null ? String(track.trackNumber) : null,
			meta: formatDuration(track.duration),
			title: track.name,
			track,
		}));

		const totalDuration = tracks.reduce((sum, t) => sum + t.duration, 0);
		const releaseDateText = formatReleaseDate(album.releaseDate);
		const durationText = tracks.length > 0 ? formatDuration(totalDuration) : null;

		const scrollStyle = createScrollStyle(isFooterVisible, isHeaderVisible);

		<layout accessibilityLabel='album-view' style={styles.root}>
			<scroll style={scrollStyle}>
				<DetailHeader
					animationsEnabled={animationsEnabled}
					artworkCategory='album_art'
					artworkSource={album.imageUrl ?? null}
					downloadState={downloadState}
					fallbackText={album.artistName}
					imageCache={imageCache}
					logoSource={artistLogoUrl}
					modalSlot={this.modalSlot}
					onAddToQueue={tracks.length > 0 ? this.handleHeaderAddToQueueTap : undefined}
					onArtistTap={this.handleArtistLogoTap}
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
					subheaderLineOneLeft={album.name}
					subheaderLineTwoLeft={releaseDateText}
					subheaderLineTwoRight={durationText}
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
				{album.bio && <BioSection bio={album.bio} modalSlot={this.modalSlot} title={album.name} />}
				{albumGenres.length > 0 && (
					<GenrePills
						accessibilityLabel='album-genres'
						genres={albumGenres}
						onGenreTap={this.handleGenreTap}
					/>
				)}
			</scroll>
			{contextMenuTrack && (
				<TrackContextMenu
					animationsEnabled={animationsEnabled}
					imageCache={imageCache}
					onArtistTap={this.handleArtistLogoTap}
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

function formatDuration(seconds: number): string {
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const s = seconds % 60;
	const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
	return h > 0 ? `${h}:${mm}:${String(s).padStart(2, '0')}` : `${mm}:${String(s).padStart(2, '0')}`;
}

function formatReleaseDate(value?: string | null): string | null {
	if (!value) return null;
	const trimmed = value.trim();
	if (trimmed.length === 0) return null;
	const tIndex = trimmed.indexOf('T');
	if (tIndex > 0) {
		return trimmed.slice(0, tIndex);
	}
	if (/^\d{4}-\d{2}-\d{2}/.test(trimmed) && trimmed.length > 10) {
		return trimmed.slice(0, 10);
	}
	return trimmed;
}

const styles = {
	root: new Style({
		backgroundColor: theme.colors.bg,
		flexGrow: 1,
		width: '100%',
	}),
};

function createScrollStyle(isFooterVisible: boolean, isHeaderVisible: boolean): Style<ScrollView> {
	return new Style<ScrollView>({
		backgroundColor: theme.colors.bg,
		flexGrow: 1,
		padding: 8,
		paddingBottom: scrollPaddingBottom(isFooterVisible),
		paddingTop: isHeaderVisible ? theme.headerHeight + 16 : 8,
		width: '100%',
	});
}
