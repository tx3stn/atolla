import { Style } from 'valdi_core/src/Style';
import type { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';
import { DetachedSlotRenderer } from 'valdi_core/src/slot/DetachedSlotRenderer';
import { INavigatorPageVisibility } from 'valdi_navigation/src/INavigator';
import { NavigationPage } from 'valdi_navigation/src/NavigationPage';
import { NavigationPageStatefulComponent } from 'valdi_navigation/src/NavigationPageComponent';
import type { Label, ScrollView, View } from 'valdi_tsx/src/NativeTemplateElements';
import type { Album } from '../../models/Album';
import type { FooterTab, HeaderTab } from '../../models/App';
import type { Artist } from '../../models/Artist';
import type { Genre } from '../../models/Genre';
import type { Track } from '../../models/Track';
import Strings from '../../Strings';
import type { DownloadService, DownloadState } from '../../services/DownloadService';
import type { ImageCache } from '../../services/ImageCache';
import type { PaletteGenerationQueue } from '../../services/PaletteGenerationQueue';
import type { ToastService } from '../../services/ToastService';
import { type PlaybackStore, shuffleArray } from '../../stores/Playback';
import { theme } from '../../theme';
import type { Transport } from '../../transports/Transport';
import { retryResolve } from '../../utils/Async';
import { formatReleaseDate } from '../../utils/Date';
import { formatDuration } from '../../utils/Time';
import { groupTracksByDisc } from '../components/AlbumDiscGrouping';
import { BioSection } from '../components/BioSection';
import { DetailHeader } from '../components/DetailHeader';
import { FooterNav } from '../components/FooterNav';
import { GenrePills } from '../components/GenrePills';
import { normalizeGenres } from '../components/GenrePillsData';
import { LibraryHeaderNav } from '../components/LibraryHeaderNav';
import { LoadingView } from '../components/LoadingView';
import { TrackList, type TrackListEntry } from '../components/TrackList';
import { resolveGenreForNavigation, resolveGenreImageUrls } from '../flows/GenreNavigationResolver';
import { openTrackContextMenu } from '../flows/TrackContextMenu';
import type { NavBarContext } from '../NavBarContext';
import { ArtistView } from './ArtistView';
import { GenreView } from './GenreView';
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
	toastService: ToastService;
	transport: Transport;
}

interface AlbumState {
	artist: Artist | null;
	artistLogoUrl: string | null;
	downloadState: DownloadState;
	fullAlbum: Album | null;
	isHeaderVisible: boolean;
	isLoading: boolean;
	tracks: Array<Track>;
}

@NavigationPage(module)
export class AlbumView extends NavigationPageStatefulComponent<AlbumViewModel, AlbumState> {
	private loadGeneration = 0;
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

		// push synchronously with data in hand so navigation can't be lost to a slow/rejected getArtist (the context menu dismisses right after this); ArtistView loads its own data from artist.id
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
				toastService: this.viewModel.toastService,
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

		const { album, playbackStore } = this.viewModel;
		const tracks = this.state.tracks;
		playbackStore.play(tracks, album, trackIndex);
		playbackStore.setArtistLogoUrl(this.state.artistLogoUrl);
	};

	handleHeaderPlayTap = (): void => {
		if (this.state.tracks.length === 0) return;
		const { album, playbackStore } = this.viewModel;
		const tracks = this.state.tracks;
		playbackStore.play(tracks, album);
		playbackStore.setArtistLogoUrl(this.state.artistLogoUrl);
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
			// tracks belong to the album we're already viewing, so tapping the row preview just closes the menu rather than re-navigating
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

	handleHeaderShuffleTap = (): void => {
		if (this.state.tracks.length === 0) return;
		const { album, playbackStore } = this.viewModel;
		const shuffledTracks = shuffleArray(this.state.tracks);
		playbackStore.play(shuffledTracks, album);
		playbackStore.setArtistLogoUrl(this.state.artistLogoUrl);
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

		if (this.isDestroyed()) {
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
				toastService: this.viewModel.toastService,
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
			if (this.isDestroyed() || generation !== this.loadGeneration) {
				return;
			}

			const fetchedTracks = tracksResult.status === 'fulfilled' ? tracksResult.value : [];
			// keep stored order disc-grouped so playback (indexing into state.tracks) matches the per-disc sections we render
			const tracks = groupTracksByDisc(fetchedTracks).groups.flatMap((group) => group.tracks);
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
		this.viewModel.onHeaderVisibilityChange?.(false);
		this.setHeaderVisibility(false);
		this.registerDisposable(
			this.viewModel.downloadService.subscribe(() => {
				this.syncDownloadState();
			}),
		);
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
		if (this.viewModel.restoreHeaderOnDestroy ?? true) {
			this.viewModel.onHeaderVisibilityChange?.(true);
		}
		this.viewModel.onExitFromSearchNavigation?.();
		this.viewModel.onNavigationContext?.(null);
	}

	onRender(): void {
		const { artistLogoUrl, downloadState, fullAlbum, isHeaderVisible, isLoading, tracks } =
			this.state;
		const { album: partialAlbum, animationsEnabled, imageCache } = this.viewModel;
		const album = fullAlbum ?? partialAlbum;
		const modalSlot = this.viewModel.navBarContext?.modalSlot ?? this.viewModel.modalSlot;
		const albumGenres = normalizeGenres(album.genres);

		const toEntry = (track: Track): TrackListEntry => {
			const duration = formatDuration(track.duration);
			const showTrackArtist = track.artistName != null && track.artistName !== album.artistName;
			return {
				id: track.id,
				leadingLabel: track.trackNumber != null ? String(track.trackNumber) : null,
				meta: showTrackArtist ? `${duration}  ·  ${track.artistName}` : duration,
				title: track.name,
				track,
			};
		};

		const { groups, multiDisc } = groupTracksByDisc(tracks);

		const totalDuration = tracks.reduce((sum, t) => sum + t.duration, 0);
		const releaseDateText = formatReleaseDate(album.releaseDate);
		const formatText = tracks.find((t) => t.audioFormat != null)?.audioFormat ?? null;
		const durationText = tracks.length > 0 ? formatDuration(totalDuration) : null;

		const scrollStyle = styles.scroll(isHeaderVisible);

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
						toastService={this.viewModel.toastService}
					/>
					{isLoading ? (
						<LoadingView />
					) : multiDisc ? (
						groups.map((group) => (
							<layout key={`album-disc-${group.disc ?? 'none'}`} style={styles.discSection}>
								{group.disc !== null && (
									<label
										accessibilityId={`album-disc-header-${group.disc}`}
										accessibilityLabel={`album-disc-header-${group.disc}`}
										style={styles.discHeader}
										value={Strings.albumDiscHeader(group.disc)}
									/>
								)}
								<TrackList
									animationsEnabled={animationsEnabled}
									imageCache={imageCache}
									onTrackLongPress={this.handleTrackLongPress}
									onTrackTap={this.handleTrackTap}
									rowIdentityPrefix={`album-disc-${group.disc ?? 'none'}-track-`}
									tracks={group.tracks.map(toEntry)}
								/>
							</layout>
						))
					) : (
						<TrackList
							animationsEnabled={animationsEnabled}
							imageCache={imageCache}
							onTrackLongPress={this.handleTrackLongPress}
							onTrackTap={this.handleTrackTap}
							rowIdentityPrefix='album-track-'
							tracks={tracks.map(toEntry)}
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
	discHeader: new Style<Label>({
		...theme.text.mutedHeader,
		marginBottom: 4,
		marginLeft: 8,
		marginTop: 12,
	}),
	discSection: new Style({
		width: '100%',
	}),
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
	scroll: (isHeaderVisible: boolean) =>
		new Style<ScrollView>({
			backgroundColor: theme.colors.bg,
			flexGrow: 1,
			padding: 8,
			paddingBottom: theme.padding.scrollBottom,
			paddingTop: theme.padding.scrollHeader(isHeaderVisible),
			width: '100%',
		}),
};
