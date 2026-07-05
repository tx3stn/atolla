import Strings from 'atolla/src/Strings';
import { Style } from 'valdi_core/src/Style';
import type { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';
import { INavigatorPageVisibility } from 'valdi_navigation/src/INavigator';
import type { NavigationController } from 'valdi_navigation/src/NavigationController';
import { NavigationPage } from 'valdi_navigation/src/NavigationPage';
import { NavigationPageStatefulComponent } from 'valdi_navigation/src/NavigationPageComponent';
import type { Label, Layout, ScrollView, View } from 'valdi_tsx/src/NativeTemplateElements';
import type { Album } from '../../models/Album';
import { HeaderTabs } from '../../models/App';
import type { Genre } from '../../models/Genre';
import type { Track } from '../../models/Track';
import { backNavRouter } from '../../services/BackNavRouter';
import type { DownloadService, DownloadState } from '../../services/DownloadService';
import type { ImageCache } from '../../services/ImageCache';
import type { PaletteGenerationQueue } from '../../services/PaletteGenerationQueue';
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
import { TrackList, type TrackListEntry } from '../components/TrackList';
import { resolveGenreImageUrls } from '../flows/GenreNavigationResolver';
import { type DetailPushDeps, pushAlbum, pushPlaylist } from '../flows/PushDetail';
import { openTrackContextMenu } from '../flows/TrackContextMenu';
import { TRACK_PAGE_SIZE } from '../pagination/Grid';

export interface GenreViewModel {
	downloadService: DownloadService;
	genre: Genre;
	imageCache: ImageCache;
	modalSlot: DetachedSlot;
	navigationController: NavigationController;
	onNavigateToArtist?: (artistId: string) => void;
	onRootDetailControllerReady: (controller: NavigationController) => void;
	paletteQueue?: PaletteGenerationQueue;
	playbackStore: PlaybackStore;
	preferences: Preferences;
	toastService: ToastService;
	transport: Transport;
}

interface GenreState {
	artistLogoUrls: Array<string | null>;
	downloadState: DownloadState;
	hydratedGenre: Genre | null;
	isLoading: boolean;
	isLoadingNextPage: boolean;
	nextPageFailed: boolean;
	revision: number;
	totalTrackCount: number | null;
	tracks: Array<Track>;
}

@NavigationPage(module)
export class GenreView extends NavigationPageStatefulComponent<GenreViewModel, GenreState> {
	state: GenreState = {
		artistLogoUrls: [],
		downloadState: 'not_downloaded',
		hydratedGenre: null,
		isLoading: true,
		isLoadingNextPage: false,
		nextPageFailed: false,
		revision: 0,
		totalTrackCount: null,
		tracks: [],
	};

	private headerCollapse = new HeaderCollapse(headerStore);
	private hydrateGeneration = 0;

	onCreate(): void {
		backNavRouter.registerPage(this.navigationController);
		this.registerDisposable(() => backNavRouter.unregisterPage(this.navigationController));
		this.registerDisposable(() => this.headerCollapse.reset());
		const headerSectionId = headerStore.pushDetailSection(HeaderTabs.genres);
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
		void this.loadNextPage();
		void this.hydrateGenreIfNeeded();
	}

	onRender(): void {
		const { downloadState, isLoading, isLoadingNextPage, nextPageFailed, totalTrackCount, tracks } =
			this.state;
		const { imageCache, modalSlot } = this.viewModel;
		// self-heal: a genre pushed from an album/track chip may lack imageUrl; merge the fetched one
		const genre = { ...this.viewModel.genre, ...(this.state.hydratedGenre ?? {}) };

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
				<scroll
					onScroll={(event) => this.headerCollapse.handleScroll(event.y)}
					style={styles.scroll}
				>
					<DetailHeader
						animationsEnabled={this.viewModel.preferences.animationsEnabled}
						artworkCategory='album_art'
						artworkSource={genre.imageUrl ?? null}
						downloadState={downloadState}
						fallbackText={genre.name}
						modalSlot={modalSlot}
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
							imageCache={imageCache}
							onTrackLongPress={this.handleTrackLongPress}
							onTrackTap={this.handleTrackTap}
							rowIdentityPrefix='genre-track-'
							tracks={entries}
						/>
					)}
					{!isLoading && this.hasMoreTracks && !nextPageFailed && (
						<view
							accessibilityId='genre-load-more-trigger'
							accessibilityLabel='genre-load-more-trigger'
							onLayout={this.handleLoadMoreTriggerLayout}
							style={styles.loadMoreTrigger}
						/>
					)}
					{isLoadingNextPage && <label style={styles.loadMoreLabel} value={Strings.loading()} />}
					{nextPageFailed && (
						<view
							accessibilityId='genre-load-more-retry'
							accessibilityLabel='genre-load-more-retry'
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
				</scroll>
			</view>
		</layout>;
	}

	private currentPage = 0;
	private hasMoreTracks = true;
	private isLoadingPage = false;
	private triggeredAutoLoadForTrackCount: number | null = null;

	private bump = (): void => {
		this.setState({ revision: this.state.revision + 1 });
	};

	private fetchPage(
		page: number,
	): Promise<{ hasMore: boolean; items: Array<Track>; totalCount?: number }> {
		const { genre, transport } = this.viewModel;
		return transport.getTracksByGenrePage(genre.id, page, TRACK_PAGE_SIZE);
	}

	private handleDownloadTap = (): void => {
		const { downloadService, genre, transport } = this.viewModel;
		Promise.all(
			this.state.tracks.map(async (track, i) => {
				const streamUrl = transport.getTrackCacheUrl(track.id);
				if (!streamUrl) {
					return null;
				}

				const existingLogoUrl = this.state.artistLogoUrls[i] ?? null;
				if (existingLogoUrl) {
					return { artistLogoUrl: existingLogoUrl, streamUrl, track };
				}

				const artistId = track.artistId;
				if (!artistId) {
					return { artistLogoUrl: null, streamUrl, track };
				}

				try {
					const resolvedLogoUrl = await retryResolve(() => transport.getArtistLogoUrl(artistId));
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
					uniqueArtistIds.map((artistId) =>
						retryResolve(() => transport.getArtist(artistId)).catch(() => null),
					),
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
		const { playbackStore } = this.viewModel;
		const { artistLogoUrls, tracks } = this.state;
		const indices = shuffleArray(tracks.map((_, i) => i));
		playbackStore.playWithArtistLogos(
			indices.map((i) => tracks[i]),
			indices.map((i) => artistLogoUrls[i] ?? null),
		);
	};

	private handleLoadMoreTriggerLayout = (): void => {
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
		this.viewModel.downloadService.removeGenreDownload(this.viewModel.genre.id);
	};

	private detailDeps(): DetailPushDeps {
		return {
			downloadService: this.viewModel.downloadService,
			imageCache: this.viewModel.imageCache,
			modalSlot: this.viewModel.modalSlot,
			onNavigateToArtist: this.viewModel.onNavigateToArtist,
			paletteQueue: this.viewModel.paletteQueue,
			playbackStore: this.viewModel.playbackStore,
			preferences: this.viewModel.preferences,
			toastService: this.viewModel.toastService,
			transport: this.viewModel.transport,
		};
	}

	private handleTrackLongPress = (track: Track): void => {
		const { imageCache, modalSlot, playbackStore, transport } = this.viewModel;
		const { animationsEnabled, gridColumns } = this.viewModel.preferences;
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

	private handleTrackTap = (trackId: string): void => {
		const { playbackStore } = this.viewModel;
		const { artistLogoUrls, tracks } = this.state;
		const trackIndex = this.state.tracks.findIndex((track) => track.id === trackId);
		if (trackIndex < 0) {
			return;
		}

		playbackStore.playWithArtistLogos(tracks, artistLogoUrls, trackIndex);
	};

	private async hydrateGenreIfNeeded(): Promise<void> {
		const { genre, transport } = this.viewModel;
		if (genre.imageUrl) {
			return;
		}
		const generation = ++this.hydrateGeneration;
		let fetched: Genre | null = null;
		try {
			fetched = await transport.getGenre(genre.id);
		} catch {
			return;
		}
		if (this.isDestroyed() || generation !== this.hydrateGeneration || !fetched) {
			return;
		}
		this.setState({ hydratedGenre: fetched });
	}

	private async loadNextPage(): Promise<void> {
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
			const result = await this.fetchPage(nextPage);
			if (this.isDestroyed()) return;

			const artistLogoUrls = await Promise.all(
				result.items.map((t) =>
					t.artistId ? this.viewModel.transport.getArtistLogoUrl(t.artistId) : null,
				),
			);
			if (this.isDestroyed()) return;

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
			if (this.isDestroyed()) return;
			this.isLoadingPage = false;
			this.setState({ isLoading: false, isLoadingNextPage: false, nextPageFailed: true });
		}
	}

	private retryLoadMore = (): void => {
		this.triggeredAutoLoadForTrackCount = null;
		void this.loadNextPage();
	};

	private syncDownloadState(): void {
		this.setState({
			downloadState: this.viewModel.downloadService.getGenreDownloadState(this.viewModel.genre.id),
		});
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
	scroll: new Style<ScrollView>({
		backgroundColor: theme.colors.bg,
		flexGrow: 1,
		padding: 8,
		paddingBottom: theme.padding.scrollBottom,
		paddingTop: theme.padding.scrollHeader(true),
		width: '100%',
	}),
};
