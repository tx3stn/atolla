import { Style } from 'valdi_core/src/Style';
import type { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';
import { DetachedSlotRenderer } from 'valdi_core/src/slot/DetachedSlotRenderer';
import { INavigatorPageVisibility } from 'valdi_navigation/src/INavigator';
import { NavigationPage } from 'valdi_navigation/src/NavigationPage';
import { NavigationPageStatefulComponent } from 'valdi_navigation/src/NavigationPageComponent';
import type { ScrollView, View } from 'valdi_tsx/src/NativeTemplateElements';
import type { Album } from '../../models/Album';
import type { Artist } from '../../models/Artist';
import type { Genre } from '../../models/Genre';
import type { Track } from '../../models/Track';
import type { DownloadService, DownloadState } from '../../services/DownloadService';
import type { ImageCache } from '../../services/ImageCache';
import type { PaletteGenerationQueue } from '../../services/PaletteGenerationQueue';
import { type PlaybackStore, shuffleArray } from '../../stores/Playback';
import { scrollPaddingBottom, theme, topInset } from '../../theme';
import type { Transport } from '../../transports/Transport';
import { retryResolve } from '../../utils/async';
import { BioSection } from '../components/BioSection';
import { DetailHeader } from '../components/DetailHeader';
import { FooterNav } from '../components/FooterNav';
import type { FooterTab } from '../components/FooterTab';
import { GenrePills } from '../components/GenrePills';
import { normalizeGenres } from '../components/GenrePillsData';
import type { HeaderTab } from '../components/HeaderTabs';
import { LibraryHeaderNav } from '../components/LibraryHeaderNav';
import { LoadingView } from '../components/LoadingView';
import { TrackList, type TrackListEntry } from '../components/TrackList';
import { openTrackContextMenu } from '../flows/trackContextMenuController';
import type { NavBarContext } from '../NavBarContext';
import { ArtistView } from './ArtistView';
import { resolveGenreForNavigation, resolveGenreImageUrls } from './GenreNavigationResolver';
import { GenreView } from './GenreView';
import { syncArtistLogosForQueue } from './HomeViewLogic';
import type { LibraryNavContext } from './LibraryView';
import { PlaylistView } from './PlaylistView';

export interface AlbumViewModel {
	album: Album;
	animationsEnabled: boolean;
	downloadService: DownloadService;
	gridColumns: number;
	imageCache: ImageCache;
	isHeaderVisible?: boolean;
	modalSlot?: DetachedSlot;
	navBarContext?: NavBarContext;
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
	downloadState: DownloadState;
	fullAlbum: Album | null;
	isFooterVisible: boolean;
	isHeaderVisible: boolean;
	isLoading: boolean;
	tracks: Array<Track>;
}

@NavigationPage(module)
export class AlbumView extends NavigationPageStatefulComponent<AlbumViewModel, AlbumState> {
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
		downloadState: 'not_downloaded',
		fullAlbum: null,
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

		// Push synchronously with the data already in hand so the navigation can
		// never be lost to a slow or rejected getArtist call (the context menu
		// dismisses immediately after this runs). ArtistView loads its own data
		// from artist.id.
		const artist =
			this.state.artist ??
			({
				id: album.artistId,
				logoUrl: this.state.artistLogoUrl ?? null,
				name: album.artistName,
			} as Artist);

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
				paletteQueue,
				playbackStore,
				restoreHeaderOnDestroy: false,
				transport,
			},
			{},
			{ animated: animationsEnabled },
		);
	};

	handleTrackTap = (trackId: string): void => {
		if (this.state.tracks.length === 0) return;

		const trackIndex = this.state.tracks.findIndex((track) => track.id === trackId);
		if (trackIndex < 0) {
			return;
		}

		const { album, playbackStore, transport } = this.viewModel;
		const tracks = this.state.tracks;
		playbackStore.play(tracks, album, trackIndex);
		playbackStore.setArtistLogoUrl(this.state.artistLogoUrl);

		void syncArtistLogosForQueue(playbackStore, tracks, transport);
	};

	handleHeaderPlayTap = (): void => {
		if (this.state.tracks.length === 0) return;
		const { album, playbackStore, transport } = this.viewModel;
		const tracks = this.state.tracks;
		playbackStore.play(tracks, album);
		playbackStore.setArtistLogoUrl(this.state.artistLogoUrl);

		void syncArtistLogosForQueue(playbackStore, tracks, transport);
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
		openTrackContextMenu(track, modalSlot, {
			animationsEnabled,
			gridColumns,
			imageCache,
			// Tracks here belong to the album we're already viewing, so tapping the
			// row preview just closes the menu (onDismiss) rather than re-navigating.
			onAlbumTap: () => {},
			onArtistTap: this.handleArtistLogoTap,
			onDismiss: () => {},
			onPlaylistCreated: (playlist) => {
				this.navigationController.push(
					PlaylistView,
					{
						animationsEnabled,
						downloadService,
						gridColumns,
						imageCache,
						navBarContext: this.viewModel.navBarContext,
						paletteQueue,
						playbackStore,
						playlist,
						transport,
					},
					{},
					{ animated: animationsEnabled },
				);
			},
			playbackStore,
			transport,
		});
	};

	handleHeaderShuffleTap = (): void => {
		if (this.state.tracks.length === 0) return;
		const { album, playbackStore, transport } = this.viewModel;
		const shuffledTracks = shuffleArray(this.state.tracks);
		playbackStore.play(shuffledTracks, album);
		playbackStore.setArtistLogoUrl(this.state.artistLogoUrl);

		void syncArtistLogosForQueue(playbackStore, shuffledTracks, transport);
	};

	handleDownloadTap = (): void => {
		const { album, downloadService, transport } = this.viewModel;
		const tracks = this.state.tracks
			.map((track) => {
				const streamUrl = transport.getTrackCacheUrl(track.id);
				return streamUrl ? { streamUrl, track } : null;
			})
			.filter((t): t is { streamUrl: string; track: Track } => t !== null);

		const artistLogoUrlPromise = this.state.artistLogoUrl
			? Promise.resolve(this.state.artistLogoUrl)
			: retryResolve(() => transport.getArtistLogoUrl(album.artistId)).catch(() => null);

		const allGenres = [
			...(album.genres ?? []),
			...tracks.flatMap(({ track }) => track.genres ?? []),
		];

		Promise.all([artistLogoUrlPromise, resolveGenreImageUrls(transport, allGenres)]).then(
			([artistLogoUrl, resolvedGenres]) => {
				if (artistLogoUrl && !this.state.artistLogoUrl) {
					this.setState({ artistLogoUrl });
				}
				downloadService.downloadAlbum({
					album,
					artistImageUrl: this.state.artist?.imageUrl ?? null,
					artistLogoUrl,
					resolvedGenres,
					tracks,
				});
			},
		);
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
		this.setState({ fullAlbum: null, isLoading: true });

		const needsFullAlbum = album.genres === undefined;

		Promise.all([
			transport
				.getTracksByAlbum(album.id)
				.then((v) => ({ status: 'fulfilled' as const, value: v }))
				.catch((r) => ({ reason: r, status: 'rejected' as const })),
			transport
				.getArtist(album.artistId)
				.then((v) => ({ status: 'fulfilled' as const, value: v }))
				.catch((r) => ({ reason: r, status: 'rejected' as const })),
			needsFullAlbum
				? transport
						.getAlbumsByIds([album.id])
						.then((v) => ({ status: 'fulfilled' as const, value: v }))
						.catch((r) => ({ reason: r, status: 'rejected' as const }))
				: Promise.resolve({ status: 'fulfilled' as const, value: [] as Array<Album> }),
		]).then(([tracksResult, artistResult, fullAlbumResult]) => {
			if (this.hasBeenDestroyed || generation !== this.loadGeneration) {
				return;
			}

			const tracks = tracksResult.status === 'fulfilled' ? tracksResult.value : [];
			const artist = artistResult.status === 'fulfilled' ? artistResult.value : null;
			const logoUrl = artist?.logoUrl || null;
			const fullAlbum =
				fullAlbumResult.status === 'fulfilled' ? (fullAlbumResult.value[0] ?? null) : null;

			this.setState({
				artist: artist ?? null,
				artistLogoUrl: logoUrl,
				fullAlbum,
				isLoading: false,
				tracks,
			});
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
		const {
			artistLogoUrl,
			downloadState,
			fullAlbum,
			isFooterVisible,
			isHeaderVisible,
			isLoading,
			tracks,
		} = this.state;
		const { album: partialAlbum, animationsEnabled, imageCache } = this.viewModel;
		const album = fullAlbum ?? partialAlbum;
		const modalSlot = this.viewModel.navBarContext?.modalSlot ?? this.viewModel.modalSlot;
		const albumGenres = normalizeGenres(album.genres);

		const entries: Array<TrackListEntry> = tracks.map((track) => {
			const duration = formatDuration(track.duration);
			const showTrackArtist = track.artistName != null && track.artistName !== album.artistName;
			return {
				id: track.id,
				leadingLabel: track.trackNumber != null ? String(track.trackNumber) : null,
				meta: showTrackArtist ? `${duration}  ·  ${track.artistName}` : duration,
				title: track.name,
				track,
			};
		});

		const totalDuration = tracks.reduce((sum, t) => sum + t.duration, 0);
		const releaseDateText = formatReleaseDate(album.releaseDate);
		const formatText = tracks.find((t) => t.audioFormat != null)?.audioFormat ?? null;
		const durationText = tracks.length > 0 ? formatDuration(totalDuration) : null;

		const scrollStyle = createScrollStyle(isFooterVisible, isHeaderVisible);

		<layout accessibilityLabel='album-view' style={styles.root}>
			<view accessibilityId='album-view' style={styles.fullScreen}>
				<scroll style={scrollStyle}>
					<DetailHeader
						animationsEnabled={animationsEnabled}
						artworkCategory='album_art'
						artworkSource={album.imageUrl ?? null}
						downloadState={downloadState}
						fallbackText={album.artistName}
						logoSource={artistLogoUrl}
						modalSlot={this.viewModel.navBarContext?.modalSlot ?? this.viewModel.modalSlot}
						onAddToQueue={tracks.length > 0 ? this.handleHeaderAddToQueueTap : undefined}
						onArtistTap={this.handleArtistLogoTap}
						onDownload={this.handleDownloadTap}
						onHideHeaderGesture={this.handleHideHeaderGesture}
						onPlay={tracks.length > 0 ? this.handleHeaderPlayTap : undefined}
						onRemoveDownload={this.handleRemoveDownloadTap}
						onRevealHeaderGesture={this.handleRevealHeaderGesture}
						onShuffle={tracks.length > 0 ? this.handleHeaderShuffleTap : undefined}
						subheaderLineOneLeft={album.name}
						subheaderLineTwoBadge={formatText}
						subheaderLineTwoLeft={releaseDateText}
						subheaderLineTwoRight={durationText}
					/>
					{isLoading ? (
						<LoadingView />
					) : (
						<TrackList
							animationsEnabled={animationsEnabled}
							imageCache={imageCache}
							onTrackLongPress={this.handleTrackLongPress}
							onTrackTap={this.handleTrackTap}
							rowIdentityPrefix='album-track-'
							tracks={entries}
						/>
					)}
					{album.bio && (
						<BioSection
							bio={album.bio}
							modalSlot={this.viewModel.navBarContext?.modalSlot ?? this.viewModel.modalSlot}
							title={album.name}
						/>
					)}
					{albumGenres.length > 0 && (
						<GenrePills
							accessibilityId='album-genres'
							genres={albumGenres}
							onGenreTap={this.handleGenreTap}
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
