import type { Album } from 'atolla_core/src/models/Album';
import type { Artist } from 'atolla_core/src/models/Artist';
import type { Genre } from 'atolla_core/src/models/Genre';
import type { Track } from 'atolla_core/src/models/Track';
import Strings from 'atolla_core/src/Strings';
import type { Transport } from 'atolla_core/src/transports/Transport';
import { fireAndForget, retryResolve } from 'atolla_core/src/utils/Async';
import {
	mergeGenreCollections,
	resolveGenreForNavigation,
	resolveGenreImageUrls,
} from 'atolla_core/src/utils/Genres';
import type { DownloadService, DownloadState } from 'atolla_player/src/services/DownloadService';
import type { TrackSource } from 'atolla_player/src/services/TrackSource';
import { type PlaybackStore, shuffleArray } from 'atolla_player/src/stores/Playback';
import { Style } from 'valdi_core/src/Style';
import type { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';
import { INavigatorPageVisibility } from 'valdi_navigation/src/INavigator';
import type { NavigationController } from 'valdi_navigation/src/NavigationController';
import { NavigationPage } from 'valdi_navigation/src/NavigationPage';
import { NavigationPageStatefulComponent } from 'valdi_navigation/src/NavigationPageComponent';
import type { Label, Layout, ScrollView, View } from 'valdi_tsx/src/NativeTemplateElements';
import { HeaderTabs } from '../../models/App';
import { appServices } from '../../services/AppServices';
import { backNavRouter } from '../../services/BackNavRouter';
import type { LyricsService } from '../../services/LyricsService';
import type { NetworkStatus } from '../../services/NetworkStatus';
import type { PaletteGenerationQueue } from '../../services/PaletteGenerationQueue';
import type { ToastService } from '../../services/ToastService';
import type { ViewCache } from '../../services/ViewCache';
import { HeaderCollapse, headerStore } from '../../stores/Header';
import type { PinnedItemsStore } from '../../stores/PinnedItems';
import type { Preferences } from '../../stores/Preferences';
import { theme } from '../../theme';
import { CancelableController } from '../../utils/CancelableController';
import { BioSection } from '../components/BioSection';
import { type Card, CardGrid } from '../components/CardGrid';
import { DetailHeader } from '../components/DetailHeader';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { GenrePills } from '../components/GenrePills';
import { LoadingView } from '../components/LoadingView';
import { RefreshableScroll } from '../components/RefreshableScroll';
import { TrackList, type TrackListEntry } from '../components/TrackList';
import { createPlaylistAndAddTracks } from '../flows/CreatePlaylist';
import { closeSlot, openSlot } from '../flows/ModalSlotFlow';
import { type DetailPushDeps, pushAlbum, pushGenre, pushPlaylist } from '../flows/PushDetail';
import { openTrackContextMenu } from '../flows/TrackContextMenu';
import { CardContextMenu, type CardContextMenuCard } from '../modals/CardContextMenu';
import { CreatePlaylistModal } from '../modals/CreatePlaylistModal';
import { AddToPlaylistView } from './AddToPlaylistView';
import { sortArtistAlbums } from './sort/Albums';

export interface ArtistViewModel {
	artist: Artist;
	downloadService: DownloadService;
	lyricsService: LyricsService;
	modalSlot: DetachedSlot;
	navigationController: NavigationController;
	networkStatus: NetworkStatus;
	paletteQueue?: PaletteGenerationQueue;
	pinnedItemsStore?: PinnedItemsStore;
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
	private activeTransport!: Transport;
	private cachedAlbumCards: Array<Card> = [];
	private cachedAlbumCardsSource: Array<Album> | null = null;
	private cachedArtistGenres: Array<Genre> = [];
	private cachedArtistGenresAlbumsSource: Array<Album> | null = null;
	private cachedArtistGenresSource: Artist['genres'] | undefined = undefined;
	private cachedTopTrackEntries: Array<TrackListEntry> = [];
	private cachedTopTrackEntriesSource: Array<Track> | null = null;
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
		this.activeTransport = this.viewModel.transport;
		backNavRouter.registerPage(this.navigationController);
		this.registerDisposable(() => backNavRouter.unregisterPage(this.navigationController));
		this.registerDisposable(() => this.headerCollapse.reset());
		const headerSectionId = headerStore.pushDetailSection(HeaderTabs.artists);
		this.registerDisposable(() => headerStore.clearDetailSection(headerSectionId));
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
		this.registerDisposable(this.viewModel.networkStatus.subscribe(this.bump));
		this.registerDisposable(appServices.subscribe(this.handleServicesChange));
		this.registerDisposable(() => this.cancelInFlightReads());
		this.registerDisposable(this.playlistFlow.cancel);
		this.syncDownloadState();
		this.seedFromCache();
		this.loadArtistData();
	}

	onRender(): void {
		const { modalSlot } = this.viewModel;
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
		const { animationsEnabled, downloadOnWifiOnly } = this.viewModel.preferences;
		const downloadEnabled = !(
			downloadOnWifiOnly && this.viewModel.networkStatus.getTransport() === 'cellular'
		);
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

		const albumCards = this.getAlbumCards(albums);
		const trackEntries = this.getTopTrackEntries(topTracks);
		const isLoading = !albumsLoaded || !topTracksLoaded;
		const artistGenres = this.getArtistGenres(artist.genres, albums);

		<layout accessibilityLabel='artist-view' style={styles.root}>
			<ErrorBoundary resetKey={this.viewModel.artist.id}>
				<view accessibilityId='artist-view' style={styles.fullScreen}>
					<RefreshableScroll
						accessibilityId='artist'
						isRefreshing={this.state.isRefreshing}
						onRefresh={this.handleRefresh}
						onScroll={this.handleScroll}
						style={styles.scroll}
					>
						<DetailHeader
							animationsEnabled={animationsEnabled}
							artistId={artist.id}
							artworkCategory='artist_image'
							artworkId={artist.id}
							artworkSource={artist.imageUrl ?? null}
							downloadEnabled={downloadEnabled}
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
			</ErrorBoundary>
		</layout>;
	}

	onViewModelUpdate(prevViewModel?: ArtistViewModel): void {
		if (!prevViewModel) {
			return;
		}

		if (this.viewModel.artist.id !== prevViewModel.artist.id) {
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

	private getAlbumCards(albums: Array<Album>): Array<Card> {
		if (albums !== this.cachedAlbumCardsSource) {
			this.cachedAlbumCardsSource = albums;
			this.cachedAlbumCards = albums.map((album) => ({
				artworkKey: album.imageUrl ?? '',
				id: album.id,
				kind: 'album',
				primaryText: album.name,
				secondaryText: album.releaseDate?.slice(0, 4) ?? '',
			}));
		}

		return this.cachedAlbumCards;
	}

	private getArtistGenres(genres: Artist['genres'], albums: Array<Album>): Array<Genre> {
		if (
			genres !== this.cachedArtistGenresSource ||
			albums !== this.cachedArtistGenresAlbumsSource
		) {
			this.cachedArtistGenresSource = genres;
			this.cachedArtistGenresAlbumsSource = albums;
			this.cachedArtistGenres = mergeGenreCollections([
				genres,
				...albums.map((album) => album.genres),
			]);
		}

		return this.cachedArtistGenres;
	}

	private getTopTrackEntries(topTracks: Array<Track>): Array<TrackListEntry> {
		if (topTracks !== this.cachedTopTrackEntriesSource) {
			this.cachedTopTrackEntriesSource = topTracks;
			this.cachedTopTrackEntries = topTracks.slice(0, 5).map((track) => ({
				artworkSource: track.albumImageUrl ?? null,
				id: track.id,
				meta: track.albumName ?? '',
				title: track.name,
				track,
			}));
		}

		return this.cachedTopTrackEntries;
	}

	private detailDeps(): DetailPushDeps {
		return {
			downloadService: this.viewModel.downloadService,
			lyricsService: this.viewModel.lyricsService,
			modalSlot: this.viewModel.modalSlot,
			networkStatus: this.viewModel.networkStatus,
			paletteQueue: this.viewModel.paletteQueue,
			pinnedItemsStore: this.viewModel.pinnedItemsStore,
			playbackStore: this.viewModel.playbackStore,
			preferences: this.viewModel.preferences,
			toastService: this.viewModel.toastService,
			transport: this.activeTransport,
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
		const { modalSlot, pinnedItemsStore, playbackStore, toastService } = this.viewModel;
		const transport = this.activeTransport;
		const { animationsEnabled } = this.viewModel.preferences;
		modalSlot.slotted(() => {
			<CardContextMenu
				animationsEnabled={animationsEnabled}
				card={{ album, kind: 'album' }}
				isPinned={pinnedItemsStore?.isPinned('album', album.id) ?? false}
				onAddToPlaylist={this.handleAlbumContextMenuAddToPlaylist}
				onCreatePlaylist={this.handleAlbumContextMenuCreatePlaylist}
				onDismiss={this.handleContextMenuDismiss}
				onEntityTap={this.handleAlbumContextMenuEntityTap}
				onPin={() => {
					void pinnedItemsStore?.pin({ album, kind: 'album' });
				}}
				onUnpin={() => {
					void pinnedItemsStore?.unpin('album', album.id);
				}}
				playbackStore={playbackStore}
				toastService={toastService}
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
				onDismiss={this.closeModalSlot}
				toastService={this.viewModel.toastService}
				tracks={tracks}
				transport={this.activeTransport}
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
					(playlistName) => this.activeTransport.createPlaylist(playlistName),
					(playlistId, trackIds) => this.activeTransport.addItemsToPlaylist(playlistId, trackIds),
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
		const { artist, downloadService } = this.viewModel;
		const transport = this.activeTransport;
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

		downloadService.beginDownloadRequest('artist', artist.id);
		fireAndForget(
			'artist-download',
			Promise.all([artistLogoUrlPromise, albumEntriesPromise])
				.then(([artistLogoUrl, albumEntries]) => {
					const allGenres = albumEntries.flatMap(({ album, tracks }) => [
						...(album.genres ?? []),
						...tracks.flatMap(({ track }) => track.genres ?? []),
					]);
					return resolveGenreImageUrls(transport, allGenres).then((resolvedGenres) => ({
						albumEntries,
						artistLogoUrl,
						resolvedGenres,
					}));
				})
				.then(
					({ albumEntries, artistLogoUrl, resolvedGenres }) => {
						downloadService.downloadArtistAlbums({
							albumEntries,
							artist,
							artistLogoUrl,
							resolvedGenres,
						});
					},
					() => downloadService.cancelDownloadRequest('artist', artist.id),
				),
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
		const { modalSlot, playbackStore } = this.viewModel;
		const transport = this.activeTransport;
		const { animationsEnabled, gridColumns } = this.viewModel.preferences;
		const { albumId } = track;
		openTrackContextMenu(track, modalSlot, {
			animationsEnabled,
			gridColumns,
			lyricsService: this.viewModel.lyricsService,
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

		const { artist } = this.viewModel;
		const transport = this.activeTransport;
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

			const payload: ArtistCachePayload = {
				albums,
				allTracks,
				hydratedArtist,
				topTracks,
			};
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

	private handleScroll = (y: number): void => {
		this.headerCollapse.handleScroll(y);
	};

	private handleServicesChange = (): void => {
		const transport = appServices.get()?.transport;
		if (transport === undefined || transport === this.activeTransport) {
			return;
		}
		this.activeTransport = transport;
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
		const resolvedGenre = await resolveGenreForNavigation(this.activeTransport, genre);

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
	content: new Style<Layout>({
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
		padding: theme.scale(8),
		paddingBottom: theme.padding.scrollBottom,
		paddingTop: theme.padding.scrollHeader(true),
		width: '100%',
	}),
	section: new Style<Layout>({
		marginBottom: theme.scale(16),
		width: '100%',
	}),
	sectionCount: new Style<Label>({
		...theme.text.mutedHeader,
		margin: theme.scale(8),
	}),
	sectionHeader: new Style<Label>({
		...theme.text.mutedHeader,
		margin: theme.scale(8),
	}),
	sectionHeaderRow: new Style<Layout>({
		alignItems: 'center',
		flexDirection: 'row',
		justifyContent: 'space-between',
		width: '100%',
	}),
};
