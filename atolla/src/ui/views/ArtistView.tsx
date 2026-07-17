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
import type { TrackSource } from '../../services/TrackSource';
import type { ViewCache } from '../../services/ViewCache';
import { HeaderCollapse, headerStore } from '../../stores/Header';
import { type PlaybackStore, shuffleArray } from '../../stores/Playback';
import type { Preferences } from '../../stores/Preferences';
import { theme } from '../../theme';
import type { Transport } from '../../transports/Transport';
import { retryResolve } from '../../utils/Async';
import { CancelableController } from '../../utils/CancelableController';
import { BioSection } from '../components/BioSection';
import { CardContextMenu, type CardContextMenuCard } from '../components/CardContextMenu';
import { type Card, CardGrid } from '../components/CardGrid';
import { CreatePlaylistModal } from '../components/CreatePlaylistModal';
import { DetailHeader } from '../components/DetailHeader';
import { GenrePills } from '../components/GenrePills';
import { mergeGenreCollections } from '../components/GenrePillsData';
import { LoadingView } from '../components/LoadingView';
import { RefreshableScroll } from '../components/RefreshableScroll';
import { TrackList, type TrackListEntry } from '../components/TrackList';
import { createPlaylistAndAddTracks } from '../flows/CreatePlaylist';
import { resolveGenreForNavigation, resolveGenreImageUrls } from '../flows/GenreNavigationResolver';
import { closeSlot, openSlot } from '../flows/ModalSlotFlow';
import { type DetailPushDeps, pushAlbum, pushGenre, pushPlaylist } from '../flows/PushDetail';
import { openTrackContextMenu } from '../flows/TrackContextMenu';
import { AddToPlaylistView } from './AddToPlaylistView';
import { sortArtistAlbums } from './sort/Albums';

export interface ArtistViewModel {
	artist: Artist;
	downloadService: DownloadService;
	imageCache: ImageCache;
	modalSlot: DetachedSlot;
	navigationController: NavigationController;
	onNavigationControllerReady: (controller: NavigationController) => void;
	paletteQueue?: PaletteGenerationQueue;
	playbackStore: PlaybackStore;
	preferences: Preferences;
	toastService: ToastService;
	transport: Transport;
	viewCache: ViewCache;
}

interface ArtistState {
	albums: Array<Album>;
	albumsLoaded: boolean;
	allTracks: Array<Track>;
	contextMenuCard: CardContextMenuCard | null;
	downloadState: DownloadState;
	hydratedArtist: Artist | null;
	isRefreshing: boolean;
	revision: number;
	topTracks: Array<Track>;
	topTracksLoaded: boolean;
}

interface ArtistCachePayload {
	albums: Array<Album>;
	allTracks: Array<Track>;
	hydratedArtist: Artist | null;
	topTracks: Array<Track>;
}

@NavigationPage(module)
export class ArtistView extends NavigationPageStatefulComponent<ArtistViewModel, ArtistState> {
	private loadGeneration = 0;
	private inFlightReads: Array<{ cancel?(): void }> = [];
	private pendingCreatePlaylistTracks: TrackSource | null = null;
	private playlistFlow = new CancelableController(() => this.isDestroyed());
	private contextMenuAlbumCard: { id: string; kind: Card['kind'] } | null = null;

	state: ArtistState = {
		albums: [],
		albumsLoaded: false,
		allTracks: [],
		contextMenuCard: null,
		downloadState: 'not_downloaded',
		hydratedArtist: null,
		isRefreshing: false,
		revision: 0,
		topTracks: [],
		topTracksLoaded: false,
	};

	private headerCollapse = new HeaderCollapse(headerStore);

	onCreate(): void {
		backNavRouter.registerPage(this.navigationController);
		this.registerDisposable(() => backNavRouter.unregisterPage(this.navigationController));
		this.registerDisposable(() => this.headerCollapse.reset());
		const headerSectionId = headerStore.pushDetailSection(HeaderTabs.artists);
		this.registerDisposable(() => headerStore.clearDetailSection(headerSectionId));
		this.viewModel.onNavigationControllerReady?.(this.navigationController);
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
		this.registerDisposable(this.playlistFlow.cancel);
		this.syncDownloadState();
		this.seedFromCache();
		this.loadArtistData();
	}

	onRender(): void {
		const { imageCache, modalSlot } = this.viewModel;
		// merge the self-healed artist over the caller-supplied partial, but never let a fetched
		// `undefined` clobber an imageUrl/logoUrl the caller did supply (the mapper always emits
		// a logoUrl key)
		const partialArtist = this.viewModel.artist;
		const hydrated = this.state.hydratedArtist;
		const artist = hydrated
			? {
					...partialArtist,
					...hydrated,
					imageUrl: hydrated.imageUrl ?? partialArtist.imageUrl,
					logoUrl: hydrated.logoUrl ?? partialArtist.logoUrl,
				}
			: partialArtist;
		const { animationsEnabled } = this.viewModel.preferences;
		const { albums, albumsLoaded, allTracks, downloadState, topTracks, topTracksLoaded } =
			this.state;
		// name is empty when we navigated best-effort with only an id and the server didn't resolve
		// the artist; fall back to the name carried by the loaded albums/tracks
		const artistName =
			artist.name ||
			albums[0]?.artistName ||
			topTracks[0]?.artistName ||
			allTracks[0]?.artistName ||
			'';

		const albumCards: Array<Card> = albums.map((album) => ({
			artworkKey: album.imageUrl ?? '',
			id: album.id,
			kind: 'album',
			primaryText: album.name,
			secondaryText: album.releaseDate?.slice(0, 4) ?? '',
		}));

		const trackEntries: Array<TrackListEntry> = topTracks.slice(0, 5).map((track) => ({
			artworkSource: track.albumImageUrl ?? null,
			id: track.id,
			meta: track.albumName ?? '',
			title: track.name,
			track,
		}));

		const isLoading = !albumsLoaded || !topTracksLoaded;
		const artistGenres = mergeGenreCollections([
			artist.genres,
			...albums.map((album) => album.genres),
		]);

		<layout accessibilityLabel='artist-view' style={styles.root}>
			<view accessibilityId='artist-view' style={styles.fullScreen}>
				<RefreshableScroll
					accessibilityId='artist'
					isRefreshing={this.state.isRefreshing}
					onRefresh={this.handleRefresh}
					onScroll={(y) => this.headerCollapse.handleScroll(y)}
					style={styles.scroll}
				>
					<DetailHeader
						animationsEnabled={animationsEnabled}
						artworkCategory='artist_image'
						artworkSource={artist.imageUrl ?? null}
						downloadState={downloadState}
						fallbackText={artistName}
						logoSource={artist.logoUrl || null}
						modalSlot={modalSlot}
						onAddToQueue={allTracks.length > 0 ? this.handleHeaderAddToQueueTap : undefined}
						onDownload={this.handleDownloadTap}
						onPlay={allTracks.length > 0 ? this.handleHeaderPlayTap : undefined}
						onRemoveDownload={this.handleRemoveDownloadTap}
						onShuffle={allTracks.length > 0 ? this.handleHeaderShuffleTap : undefined}
						toastService={this.viewModel.toastService}
					/>

					{isLoading ? (
						<LoadingView />
					) : (
						<layout style={styles.content}>
							{albums.length > 0 && (
								<layout style={styles.section}>
									<layout style={styles.sectionHeaderRow}>
										<label style={styles.sectionHeader} value={Strings.artistSectionAlbums()} />
										<label style={styles.sectionCount} value={`[ ${albums.length} ]`} />
									</layout>
									<CardGrid
										accessibilityId='artist-albums-grid'
										cards={albumCards}
										columnCount={this.viewModel.preferences.gridColumns}
										onCardLongPress={this.handleAlbumCardLongPress}
										onCardTap={this.handleAlbumCardTap}
									/>
								</layout>
							)}

							{trackEntries.length > 0 && (
								<layout style={styles.section}>
									<label style={styles.sectionHeader} value={Strings.artistSectionTopTracks()} />
									<TrackList
										animationsEnabled={this.viewModel.preferences.animationsEnabled}
										imageCache={imageCache}
										onTrackLongPress={this.handleTrackLongPress}
										onTrackTap={this.handleTopTrackTap}
										rowIdentityPrefix='artist-top-track-'
										tracks={trackEntries}
									/>
								</layout>
							)}

							{artist.bio && (
								<BioSection
									bio={artist.bio}
									language={this.viewModel.preferences.language}
									logoUrl={artist.logoUrl}
									modalSlot={modalSlot}
									title={artistName}
								/>
							)}

							{artistGenres.length > 0 && (
								<GenrePills
									accessibilityId='artist-genres'
									genres={artistGenres}
									onGenreTap={this.handleGenreTap}
								/>
							)}
						</layout>
					)}
				</RefreshableScroll>
			</view>
		</layout>;
	}

	onViewModelUpdate(prevViewModel?: ArtistViewModel): void {
		if (!prevViewModel) {
			return;
		}

		if (
			this.viewModel.transport !== prevViewModel.transport ||
			this.viewModel.artist.id !== prevViewModel.artist.id
		) {
			this.loadArtistData();
		}
	}

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

	private closeModalSlot = (): void => {
		closeSlot(this.viewModel.modalSlot);
	};

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

	private handleAlbumCardTap = (card: { id: string; kind: Card['kind'] }): void => {
		const album = this.state.albums.find((candidate) => candidate.id === card.id);
		if (!album) {
			return;
		}

		pushAlbum(this.navigationController, this.detailDeps(), album);
	};

	private handleAlbumCardLongPress = (card: { id: string; kind: Card['kind'] }): void => {
		const album = this.state.albums.find((candidate) => candidate.id === card.id);
		if (!album) return;

		this.setState({ contextMenuCard: { album, kind: 'album' } });
		this.contextMenuAlbumCard = card;
		const { modalSlot, playbackStore, transport } = this.viewModel;
		const { animationsEnabled } = this.viewModel.preferences;
		modalSlot.slotted(() => {
			<CardContextMenu
				animationsEnabled={animationsEnabled}
				card={{ album, kind: 'album' }}
				onAddToPlaylist={this.handleAlbumContextMenuAddToPlaylist}
				onCreatePlaylist={this.handleAlbumContextMenuCreatePlaylist}
				onDismiss={this.handleContextMenuDismiss}
				onEntityTap={this.handleAlbumContextMenuEntityTap}
				playbackStore={playbackStore}
				transport={transport}
			/>;
		});
	};

	private handleAlbumContextMenuAddToPlaylist = (tracks: TrackSource): void => {
		this.setState({ contextMenuCard: null });
		openSlot(this.viewModel.modalSlot, () => {
			<AddToPlaylistView
				animationsEnabled={this.viewModel.preferences.animationsEnabled}
				gridColumns={this.viewModel.preferences.gridColumns}
				imageCache={this.viewModel.imageCache}
				onDismiss={this.closeModalSlot}
				toastService={this.viewModel.toastService}
				tracks={tracks}
				transport={this.viewModel.transport}
			/>;
		});
	};

	private handleAlbumContextMenuCreatePlaylist = (tracks: TrackSource): void => {
		this.pendingCreatePlaylistTracks = tracks;
		this.setState({ contextMenuCard: null });
		openSlot(this.viewModel.modalSlot, () => {
			<CreatePlaylistModal
				animationsEnabled={this.viewModel.preferences.animationsEnabled}
				onCancel={this.closeModalSlot}
				onCreate={this.handleAlbumContextMenuCreatePlaylistConfirm}
			/>;
		});
	};

	private handleAlbumContextMenuCreatePlaylistConfirm = async (name: string): Promise<void> => {
		const tracks = this.pendingCreatePlaylistTracks;
		if (!tracks) return;
		try {
			const { alive, value: playlist } = await this.playlistFlow.run(
				createPlaylistAndAddTracks(
					name,
					(playlistName) => this.viewModel.transport.createPlaylist(playlistName),
					(playlistId, trackIds) =>
						this.viewModel.transport.addItemsToPlaylist(playlistId, trackIds),
					tracks,
					{ isCancelled: () => this.isDestroyed() },
				),
			);
			if (!alive) return;
			this.pendingCreatePlaylistTracks = null;
			this.closeModalSlot();
			pushPlaylist(this.navigationController, this.detailDeps(), playlist);
		} catch {
			if (this.isDestroyed()) return;
			this.pendingCreatePlaylistTracks = null;
			this.closeModalSlot();
		}
	};

	private handleAlbumContextMenuEntityTap = (): void => {
		const card = this.contextMenuAlbumCard;
		if (!card) return;
		this.handleContextMenuDismiss();
		this.handleAlbumCardTap(card);
	};

	private handleContextMenuDismiss = (): void => {
		closeSlot(this.viewModel.modalSlot);
		this.contextMenuAlbumCard = null;
		this.setState({ contextMenuCard: null });
	};

	private handleDownloadTap = (): void => {
		const { artist, downloadService, transport } = this.viewModel;
		const artistLogoUrlPromise = artist.logoUrl
			? Promise.resolve(artist.logoUrl)
			: retryResolve(() => transport.getArtistLogoUrl(artist.id)).catch(() => null);

		const albumEntriesPromise = Promise.all(
			this.state.albums.map((album) =>
				transport.getTracksByAlbum(album.id).then((tracks) => ({
					album,
					tracks: tracks
						.map((track) => {
							const streamUrl = transport.getTrackCacheUrl(track.id);
							return streamUrl ? { streamUrl, track } : null;
						})
						.filter((t): t is { streamUrl: string; track: Track } => t !== null),
				})),
			),
		);

		Promise.all([artistLogoUrlPromise, albumEntriesPromise]).then(
			([artistLogoUrl, albumEntries]) => {
				const allGenres = albumEntries.flatMap(({ album, tracks }) => [
					...(album.genres ?? []),
					...tracks.flatMap(({ track }) => track.genres ?? []),
				]);
				resolveGenreImageUrls(transport, allGenres).then((resolvedGenres) => {
					downloadService.downloadArtistAlbums({
						albumEntries,
						artist,
						artistLogoUrl,
						resolvedGenres,
					});
				});
			},
		);
	};

	private handleGenreTap = (genre: Genre): void => {
		void this.navigateToGenre(genre);
	};

	private handleHeaderAddToQueueTap = (): Promise<void> => {
		this.viewModel.playbackStore.addToQueue(this.state.allTracks);
		return Promise.resolve();
	};

	private handleHeaderPlayTap = (): void => {
		const { artist, playbackStore } = this.viewModel;
		playbackStore.playTracks(this.state.allTracks);
		playbackStore.setArtistLogoUrl(artist.logoUrl || null);
	};

	private handleHeaderShuffleTap = (): void => {
		const { artist, playbackStore } = this.viewModel;
		playbackStore.playTracks(shuffleArray(this.state.allTracks));
		playbackStore.setArtistLogoUrl(artist.logoUrl || null);
	};

	private handleTrackLongPress = (track: Track): void => {
		const { imageCache, modalSlot, playbackStore, transport } = this.viewModel;
		const { animationsEnabled, gridColumns } = this.viewModel.preferences;
		const { albumId } = track;
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
			onDismiss: () => {},
			onPlaylistCreated: (playlist) => {
				pushPlaylist(this.navigationController, this.detailDeps(), playlist);
			},
			playbackStore,
			toastService: this.viewModel.toastService,
			transport,
		});
	};

	private handleRemoveDownloadTap = (): void => {
		this.viewModel.downloadService.removeArtistDownload(this.viewModel.artist.id);
	};

	private handleTopTrackTap = (trackId: string): void => {
		const { artist, playbackStore } = this.viewModel;
		const trackIndex = this.state.topTracks.findIndex((track) => track.id === trackId);
		if (trackIndex < 0) {
			return;
		}

		playbackStore.playTracks(this.state.topTracks, trackIndex);
		playbackStore.setArtistLogoUrl(artist.logoUrl || null);
	};

	private loadArtistData(): void {
		const generation = this.loadGeneration + 1;
		this.loadGeneration = generation;
		this.cancelInFlightReads();

		const { artist, transport } = this.viewModel;
		// self-heal: callers may push a partial artist (id + name only, e.g. from a context menu);
		// fetch the full artist to fill the header artwork/logo when either is missing
		const needsArtist = !artist.imageUrl || !artist.logoUrl;
		// keep any seeded/previous content visible during a revalidate; only blank to the spinner cold
		if (!this.state.albumsLoaded && !this.state.topTracksLoaded) {
			this.setState({
				albums: [],
				albumsLoaded: false,
				allTracks: [],
				hydratedArtist: null,
				topTracks: [],
				topTracksLoaded: false,
			});
		}

		const albumsRead = transport.getAlbumsByArtist(artist.id);
		const allTracksRead = transport.getTracksByArtist(artist.id);
		const topTracksRead = transport.getArtistTopTracks(artist.id);
		const artistRead = needsArtist ? transport.getArtist(artist.id) : undefined;
		this.inFlightReads = artistRead
			? [albumsRead, allTracksRead, topTracksRead, artistRead]
			: [albumsRead, allTracksRead, topTracksRead];

		Promise.all([
			albumsRead.then(
				(v) => ({ status: 'fulfilled' as const, value: v }),
				(r) => ({ reason: r, status: 'rejected' as const }),
			),
			allTracksRead.then(
				(v) => ({ status: 'fulfilled' as const, value: v }),
				(r) => ({ reason: r, status: 'rejected' as const }),
			),
			topTracksRead.then(
				(v) => ({ status: 'fulfilled' as const, value: v }),
				(r) => ({ reason: r, status: 'rejected' as const }),
			),
			artistRead
				? artistRead.then(
						(v) => ({ status: 'fulfilled' as const, value: v }),
						(r) => ({ reason: r, status: 'rejected' as const }),
					)
				: Promise.resolve({ status: 'fulfilled' as const, value: null as Artist | null }),
		]).then(([albumsResult, allTracksResult, topTracksResult, artistResult]) => {
			if (this.isDestroyed() || generation !== this.loadGeneration) {
				return;
			}
			this.inFlightReads = [];

			const albums =
				albumsResult.status === 'fulfilled' ? sortArtistAlbums(albumsResult.value) : [];
			const allTracks = allTracksResult.status === 'fulfilled' ? allTracksResult.value : [];
			const topTracks = topTracksResult.status === 'fulfilled' ? topTracksResult.value : [];
			const hydratedArtist = artistResult.status === 'fulfilled' ? artistResult.value : null;

			const payload: ArtistCachePayload = { albums, allTracks, hydratedArtist, topTracks };
			if (albums.length > 0 || topTracks.length > 0 || allTracks.length > 0) {
				this.viewModel.viewCache.store(this.cacheKey(), payload);
			}
			this.setState({
				...payload,
				albumsLoaded: true,
				isRefreshing: false,
				topTracksLoaded: true,
			});
			this.viewModel.paletteQueue?.enqueueAlbums(albums);
		});
	}

	private cacheKey(): string {
		return `artist:${this.viewModel.artist.id}`;
	}

	private handleRefresh = (): void => {
		if (this.state.isRefreshing) {
			return;
		}
		this.viewModel.viewCache.invalidate(this.cacheKey());
		this.setState({ isRefreshing: true });
		this.loadArtistData();
	};

	private seedFromCache(): void {
		const cached = this.viewModel.viewCache.get<ArtistCachePayload>(this.cacheKey());
		if (cached) {
			this.setState({ ...cached, albumsLoaded: true, topTracksLoaded: true });
			return;
		}
		void this.viewModel.viewCache.load<ArtistCachePayload>(this.cacheKey()).then((disk) => {
			if (disk && !this.isDestroyed() && !this.state.albumsLoaded) {
				this.setState({ ...disk, albumsLoaded: true, topTracksLoaded: true });
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
			downloadState: this.viewModel.downloadService.getArtistDownloadState(
				this.viewModel.artist.id,
			),
		});
	}
}

const styles = {
	content: new Style({
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
	scroll: new Style<ScrollView>({
		backgroundColor: theme.colors.bg,
		flexGrow: 1,
		padding: 8,
		paddingBottom: theme.padding.scrollBottom,
		paddingTop: theme.padding.scrollHeader(true),
		width: '100%',
	}),
	section: new Style({
		marginBottom: 16,
		width: '100%',
	}),
	sectionCount: new Style<Label>({
		...theme.text.mutedHeader,
		margin: 8,
	}),
	sectionHeader: new Style<Label>({
		...theme.text.mutedHeader,
		margin: 8,
	}),
	sectionHeaderRow: new Style<Layout>({
		alignItems: 'center',
		flexDirection: 'row',
		justifyContent: 'space-between',
		width: '100%',
	}),
};
