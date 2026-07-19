import { Style } from 'valdi_core/src/Style';
import type { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';
import { INavigatorPageVisibility } from 'valdi_navigation/src/INavigator';
import type { NavigationController } from 'valdi_navigation/src/NavigationController';
import { NavigationPage } from 'valdi_navigation/src/NavigationPage';
import { NavigationPageStatefulComponent } from 'valdi_navigation/src/NavigationPageComponent';
import type { Label, Layout, ScrollView, View } from 'valdi_tsx/src/NativeTemplateElements';
import type { Album } from '../../models/Album';
import { HeaderTabs } from '../../models/App';
import type { Artist } from '../../models/Artist';
import type { Genre } from '../../models/Genre';
import type { Track } from '../../models/Track';
import Strings from '../../Strings';
import { backNavRouter } from '../../services/BackNavRouter';
import type { DownloadService, DownloadState } from '../../services/DownloadService';
import type { ImageCache } from '../../services/ImageCache';
import type { PaletteGenerationQueue } from '../../services/PaletteGenerationQueue';
import type { ToastService } from '../../services/ToastService';
import type { ViewCache } from '../../services/ViewCache';
import { HeaderCollapse, headerStore } from '../../stores/Header';
import { type PlaybackStore, shuffleArray } from '../../stores/Playback';
import type { Preferences } from '../../stores/Preferences';
import { theme } from '../../theme';
import type { Transport } from '../../transports/Transport';
import { retryResolve } from '../../utils/Async';
import { formatReleaseDate } from '../../utils/Date';
import { formatDuration } from '../../utils/Time';
import { groupTracksByDisc } from '../components/AlbumDiscGrouping';
import { BioSection } from '../components/BioSection';
import { DetailHeader } from '../components/DetailHeader';
import { GenrePills } from '../components/GenrePills';
import { normalizeGenres } from '../components/GenrePillsData';
import { LoadingView } from '../components/LoadingView';
import { RefreshableScroll } from '../components/RefreshableScroll';
import { TrackList, type TrackListEntry } from '../components/TrackList';
import { resolveGenreForNavigation, resolveGenreImageUrls } from '../flows/GenreNavigationResolver';
import { type DetailPushDeps, pushArtist, pushGenre, pushPlaylist } from '../flows/PushDetail';
import { openTrackContextMenu } from '../flows/TrackContextMenu';

export interface AlbumViewModel {
	album: Album;
	downloadService: DownloadService;
	imageCache: ImageCache;
	modalSlot: DetachedSlot;
	navigationController: NavigationController;
	onRootDetailControllerReady: (controller: NavigationController) => void;
	paletteQueue?: PaletteGenerationQueue;
	playbackStore: PlaybackStore;
	preferences: Preferences;
	toastService: ToastService;
	transport: Transport;
	viewCache: ViewCache;
}

interface AlbumState {
	artist: Artist | null;
	artistLogoUrl: string | null;
	downloadState: DownloadState;
	fullAlbum: Album | null;
	isLoading: boolean;
	isRefreshing: boolean;
	revision: number;
	tracks: Array<Track>;
}

interface AlbumDiscSection {
	disc: number | null;
	entries: Array<TrackListEntry>;
}

// discSections is populated only for multi-disc albums, entries only for single-disc ones; the
// renderer picks one branch, so building both would double the work on every track change
interface AlbumDerivedTracks {
	discSections: Array<AlbumDiscSection>;
	durationText: string | null;
	entries: Array<TrackListEntry>;
	formatText: string | null;
	multiDisc: boolean;
}

interface AlbumCachePayload {
	artist: Artist | null;
	artistLogoUrl: string | null;
	fullAlbum: Album | null;
	tracks: Array<Track>;
}

@NavigationPage(module)
export class AlbumView extends NavigationPageStatefulComponent<AlbumViewModel, AlbumState> {
	private cachedAlbumGenres: Array<Genre> = [];
	private cachedAlbumGenresSource: Album['genres'] | undefined = undefined;
	private cachedDerivedTracks: AlbumDerivedTracks = {
		discSections: [],
		durationText: null,
		entries: [],
		formatText: null,
		multiDisc: false,
	};
	private cachedDerivedTracksArtistName: string | undefined = undefined;
	private cachedDerivedTracksSource: Array<Track> | null = null;
	private loadGeneration = 0;
	private inFlightReads: Array<{ cancel?(): void }> = [];

	state: AlbumState = {
		artist: null,
		artistLogoUrl: null,
		downloadState: 'not_downloaded',
		fullAlbum: null,
		isLoading: true,
		isRefreshing: false,
		revision: 0,
		tracks: [],
	};

	private headerCollapse = new HeaderCollapse(headerStore);

	onCreate(): void {
		backNavRouter.registerPage(this.navigationController);
		this.registerDisposable(() => backNavRouter.unregisterPage(this.navigationController));
		this.registerDisposable(() => this.headerCollapse.reset());
		const headerSectionId = headerStore.pushDetailSection(HeaderTabs.albums);
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
		this.loadAlbumData();
	}

	onRender(): void {
		const { artistLogoUrl, downloadState, fullAlbum, isLoading, tracks } = this.state;
		const { album: partialAlbum, imageCache, modalSlot } = this.viewModel;
		const { animationsEnabled, language } = this.viewModel.preferences;
		const album = fullAlbum ?? partialAlbum;
		const albumGenres = this.getAlbumGenres(album.genres);
		const { discSections, durationText, entries, formatText, multiDisc } = this.getDerivedTracks(
			tracks,
			album.artistName,
		);
		const releaseDateText = formatReleaseDate(album.releaseDate);

		<layout accessibilityLabel='album-view' style={styles.root}>
			<view accessibilityId='album-view' style={styles.fullScreen}>
				<RefreshableScroll
					accessibilityId='album'
					isRefreshing={this.state.isRefreshing}
					onRefresh={this.handleRefresh}
					onScroll={(y) => this.headerCollapse.handleScroll(y)}
					style={styles.scroll}
				>
					<DetailHeader
						animationsEnabled={animationsEnabled}
						artworkCategory='album_art'
						artworkSource={album.imageUrl ?? null}
						downloadState={downloadState}
						fallbackText={album.artistName}
						logoSource={artistLogoUrl}
						modalSlot={modalSlot}
						onAddToQueue={tracks.length > 0 ? this.handleHeaderAddToQueueTap : undefined}
						onArtistTap={this.handleArtistLogoTap}
						onDownload={this.handleDownloadTap}
						onPlay={tracks.length > 0 ? this.handleHeaderPlayTap : undefined}
						onRemoveDownload={this.handleRemoveDownloadTap}
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
						discSections.map((section) => (
							<layout key={`album-disc-${section.disc ?? 'none'}`} style={styles.discSection}>
								{section.disc !== null && (
									<label
										accessibilityId={`album-disc-header-${section.disc}`}
										accessibilityLabel={`album-disc-header-${section.disc}`}
										style={styles.discHeader}
										value={Strings.albumDiscHeader(section.disc)}
									/>
								)}
								<TrackList
									animationsEnabled={animationsEnabled}
									imageCache={imageCache}
									onTrackLongPress={this.handleTrackLongPress}
									onTrackTap={this.handleTrackTap}
									rowIdentityPrefix={`album-disc-${section.disc ?? 'none'}-track-`}
									tracks={section.entries}
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
							tracks={entries}
						/>
					)}
					{album.bio && (
						<BioSection
							bio={album.bio}
							language={language}
							modalSlot={modalSlot}
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
				</RefreshableScroll>
			</view>
		</layout>;
	}

	onViewModelUpdate(prevViewModel?: AlbumViewModel): void {
		if (!prevViewModel) {
			return;
		}

		if (
			this.viewModel.transport !== prevViewModel.transport ||
			this.viewModel.album.id !== prevViewModel.album.id
		) {
			this.loadAlbumData();
		}
	}

	handleArtistLogoTap = (): void => {
		// push synchronously with data in hand so navigation can't be lost to a slow/rejected getArtist (the context menu dismisses right after this); ArtistView loads its own data from artist.id
		const artist =
			this.state.artist ??
			({
				id: this.viewModel.album.artistId,
				logoUrl: this.state.artistLogoUrl ?? null,
				name: this.viewModel.album.artistName,
			} as Artist);

		pushArtist(this.navigationController, this.detailDeps(), artist);
	};

	handleHeaderPlayTap = (): void => {
		if (this.state.tracks.length === 0) return;

		this.viewModel.playbackStore.play(this.state.tracks, this.viewModel.album);
		this.viewModel.playbackStore.setArtistLogoUrl(this.state.artistLogoUrl);
	};

	private bump = (): void => {
		this.setState({ revision: this.state.revision + 1 });
	};

	private cancelInFlightReads(): void {
		const reads = this.inFlightReads;
		this.inFlightReads = [];
		for (const read of reads) {
			read.cancel?.();
		}
	}

	private handleDownloadTap = (): void => {
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

	private handleGenreTap = (genre: Genre): void => {
		void this.navigateToGenre(genre);
	};

	private handleHeaderAddToQueueTap = (): Promise<void> => {
		if (this.state.tracks.length === 0) return Promise.resolve();
		this.viewModel.playbackStore.addToQueue(this.state.tracks);
		return Promise.resolve();
	};

	private handleHeaderShuffleTap = (): void => {
		if (this.state.tracks.length === 0) return;
		const { album, playbackStore } = this.viewModel;
		const shuffledTracks = shuffleArray(this.state.tracks);
		playbackStore.play(shuffledTracks, album);
		playbackStore.setArtistLogoUrl(this.state.artistLogoUrl);
	};

	private getAlbumGenres(genres: Album['genres']): Array<Genre> {
		if (genres !== this.cachedAlbumGenresSource) {
			this.cachedAlbumGenresSource = genres;
			this.cachedAlbumGenres = normalizeGenres(genres);
		}

		return this.cachedAlbumGenres;
	}

	private getDerivedTracks(tracks: Array<Track>, artistName: string): AlbumDerivedTracks {
		if (
			tracks === this.cachedDerivedTracksSource &&
			artistName === this.cachedDerivedTracksArtistName
		) {
			return this.cachedDerivedTracks;
		}

		this.cachedDerivedTracksSource = tracks;
		this.cachedDerivedTracksArtistName = artistName;

		const toEntry = (track: Track): TrackListEntry => {
			const duration = formatDuration(track.duration);
			const showTrackArtist = track.artistName != null && track.artistName !== artistName;
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

		this.cachedDerivedTracks = {
			discSections: multiDisc
				? groups.map((group) => ({ disc: group.disc, entries: group.tracks.map(toEntry) }))
				: [],
			durationText: tracks.length > 0 ? formatDuration(totalDuration) : null,
			entries: multiDisc ? [] : tracks.map(toEntry),
			formatText: tracks.find((t) => t.audioFormat != null)?.audioFormat ?? null,
			multiDisc,
		};
		return this.cachedDerivedTracks;
	}

	private detailDeps(): DetailPushDeps {
		return {
			downloadService: this.viewModel.downloadService,
			imageCache: this.viewModel.imageCache,
			modalSlot: this.viewModel.modalSlot,
			paletteQueue: this.viewModel.paletteQueue,
			playbackStore: this.viewModel.playbackStore,
			preferences: this.viewModel.preferences,
			toastService: this.viewModel.toastService,
			transport: this.viewModel.transport,
			viewCache: this.viewModel.viewCache,
		};
	}

	private handleRemoveDownloadTap = (): void => {
		this.viewModel.downloadService.removeAlbumDownload(this.viewModel.album.id);
	};

	private handleTrackLongPress = (track: Track): void => {
		const { imageCache, playbackStore, transport } = this.viewModel;
		const { animationsEnabled, gridColumns } = this.viewModel.preferences;

		openTrackContextMenu(track, this.viewModel.modalSlot, {
			animationsEnabled,
			gridColumns,
			imageCache,
			// tracks belong to the album we're already viewing, so tapping the row preview just closes the menu rather than re-navigating
			onAlbumTap: () => {},
			onArtistTap: this.handleArtistLogoTap,
			onDismiss: () => {},
			onPlaylistCreated: (playlist) => {
				pushPlaylist(this.navigationController, this.detailDeps(), playlist);
			},
			playbackStore,
			toastService: this.viewModel.toastService,
			transport,
		});
	};

	private handleTrackTap = (trackId: string): void => {
		if (this.state.tracks.length === 0) return;

		const trackIndex = this.state.tracks.findIndex((track) => track.id === trackId);
		if (trackIndex < 0) {
			return;
		}

		this.viewModel.playbackStore.play(this.state.tracks, this.viewModel.album, trackIndex);
		this.viewModel.playbackStore.setArtistLogoUrl(this.state.artistLogoUrl);
	};

	private loadAlbumData(): void {
		const generation = this.loadGeneration + 1;
		this.loadGeneration = generation;
		this.cancelInFlightReads();

		const { album, paletteQueue, transport } = this.viewModel;
		paletteQueue?.prioritize(album.imageUrl);
		// keep any seeded/previous content visible during a revalidate; only show the spinner cold
		const hasContent = this.state.tracks.length > 0;
		this.setState({
			fullAlbum: hasContent ? this.state.fullAlbum : null,
			isLoading: !hasContent,
		});

		const needsFullAlbum = album.genres === undefined || album.imageUrl === undefined;

		const tracksRead = transport.getTracksByAlbum(album.id);
		const artistRead = transport.getArtist(album.artistId);
		const fullAlbumRead = needsFullAlbum ? transport.getAlbumsByIds([album.id]) : undefined;
		this.inFlightReads = fullAlbumRead
			? [tracksRead, artistRead, fullAlbumRead]
			: [tracksRead, artistRead];

		Promise.all([
			tracksRead.then(
				(v) => ({ status: 'fulfilled' as const, value: v }),
				(r) => ({ reason: r, status: 'rejected' as const }),
			),
			artistRead.then(
				(v) => ({ status: 'fulfilled' as const, value: v }),
				(r) => ({ reason: r, status: 'rejected' as const }),
			),
			fullAlbumRead
				? fullAlbumRead.then(
						(v) => ({ status: 'fulfilled' as const, value: v }),
						(r) => ({ reason: r, status: 'rejected' as const }),
					)
				: Promise.resolve({ status: 'fulfilled' as const, value: [] as Array<Album> }),
		]).then(([tracksResult, artistResult, fullAlbumResult]) => {
			if (this.isDestroyed() || generation !== this.loadGeneration) {
				return;
			}
			this.inFlightReads = [];

			const fetchedTracks = tracksResult.status === 'fulfilled' ? tracksResult.value : [];
			// keep stored order disc-grouped so playback (indexing into state.tracks) matches the per-disc sections we render
			const tracks = groupTracksByDisc(fetchedTracks).groups.flatMap((group) => group.tracks);
			const artist = artistResult.status === 'fulfilled' ? artistResult.value : null;
			const logoUrl = artist?.logoUrl || null;
			const fullAlbum =
				fullAlbumResult.status === 'fulfilled' ? (fullAlbumResult.value[0] ?? null) : null;

			const payload: AlbumCachePayload = {
				artist: artist ?? null,
				artistLogoUrl: logoUrl,
				fullAlbum,
				tracks,
			};
			if (tracks.length > 0) {
				this.viewModel.viewCache.store(this.cacheKey(), payload);
			}
			this.setState({ ...payload, isLoading: false, isRefreshing: false });
		});
	}

	private cacheKey(): string {
		return `album:${this.viewModel.album.id}`;
	}

	private handleRefresh = (): void => {
		if (this.state.isRefreshing) {
			return;
		}
		this.viewModel.viewCache.invalidate(this.cacheKey());
		this.setState({ isRefreshing: true });
		this.loadAlbumData();
	};

	private seedFromCache(): void {
		const cached = this.viewModel.viewCache.get<AlbumCachePayload>(this.cacheKey());
		if (cached) {
			this.setState({ ...cached, isLoading: false });
			return;
		}
		void this.viewModel.viewCache.load<AlbumCachePayload>(this.cacheKey()).then((disk) => {
			if (disk && !this.isDestroyed() && this.state.tracks.length === 0) {
				this.setState({ ...disk, isLoading: false });
			}
		});
	}

	private async navigateToGenre(genre: Genre): Promise<void> {
		const resolvedGenre = await resolveGenreForNavigation(this.viewModel.transport, genre);

		if (this.isDestroyed()) {
			return;
		}

		pushGenre(this.navigationController, this.detailDeps(), resolvedGenre);
	}

	private syncDownloadState(): void {
		this.setState({
			downloadState: this.viewModel.downloadService.getAlbumDownloadState(this.viewModel.album.id),
		});
	}
}

const styles = {
	discHeader: new Style<Label>({
		...theme.text.mutedHeader,
		marginBottom: 4,
		marginLeft: 8,
		marginTop: 12,
	}),
	discSection: new Style<Layout>({
		width: '100%',
	}),
	fullScreen: new Style<View>({
		height: '100%',
		position: 'relative',
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
