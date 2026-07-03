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
import { HeaderCollapse, headerStore } from '../../stores/Header';
import { type PlaybackStore, shuffleArray } from '../../stores/Playback';
import { theme } from '../../theme';
import type { Transport } from '../../transports/Transport';
import { retryResolve } from '../../utils/Async';
import { BioSection } from '../components/BioSection';
import { CardContextMenu, type CardContextMenuCard } from '../components/CardContextMenu';
import { type Card, CardGrid } from '../components/CardGrid';
import { CreatePlaylistModal } from '../components/CreatePlaylistModal';
import { DetailHeader } from '../components/DetailHeader';
import { GenrePills } from '../components/GenrePills';
import { mergeGenreCollections } from '../components/GenrePillsData';
import { LoadingView } from '../components/LoadingView';
import { TrackList, type TrackListEntry } from '../components/TrackList';
import { createPlaylistAndAddTracks } from '../flows/CreatePlaylist';
import { resolveGenreForNavigation, resolveGenreImageUrls } from '../flows/GenreNavigationResolver';
import { closeSlot, openSlot } from '../flows/ModalSlotFlow';
import { openTrackContextMenu } from '../flows/TrackContextMenu';
import { AddToPlaylistView } from './AddToPlaylistView';
import { AlbumView } from './AlbumView';
import { GenreView } from './GenreView';
import { PlaylistView } from './PlaylistView';
import { sortArtistAlbums } from './sort/Albums';

export interface ArtistViewModel {
	animationsEnabled: boolean;
	artist: Artist;
	downloadService: DownloadService;
	gridColumns: number;
	imageCache: ImageCache;
	modalSlot: DetachedSlot;
	navigationController: NavigationController;
	onNavigationControllerReady: (controller: NavigationController) => void;
	paletteQueue?: PaletteGenerationQueue;
	playbackStore: PlaybackStore;
	toastService: ToastService;
	transport: Transport;
}

interface ArtistState {
	albums: Array<Album>;
	albumsLoaded: boolean;
	allTracks: Array<Track>;
	contextMenuCard: CardContextMenuCard | null;
	downloadState: DownloadState;
	topTracks: Array<Track>;
	topTracksLoaded: boolean;
}

@NavigationPage(module)
export class ArtistView extends NavigationPageStatefulComponent<ArtistViewModel, ArtistState> {
	private loadGeneration = 0;
	private pendingCreatePlaylistTracks: Array<Track> | null = null;
	private contextMenuAlbumCard: { id: string; kind: Card['kind'] } | null = null;

	state: ArtistState = {
		albums: [],
		albumsLoaded: false,
		allTracks: [],
		contextMenuCard: null,
		downloadState: 'not_downloaded',
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
		this.syncDownloadState();
		this.loadArtistData();
	}

	onRender(): void {
		const { artist, animationsEnabled, imageCache, modalSlot } = this.viewModel;
		const { albums, albumsLoaded, allTracks, downloadState, topTracks, topTracksLoaded } =
			this.state;

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
				<scroll
					onScroll={(event) => this.headerCollapse.handleScroll(event.y)}
					style={styles.scroll}
				>
					<DetailHeader
						animationsEnabled={animationsEnabled}
						artworkCategory='artist_image'
						artworkSource={artist.imageUrl ?? null}
						downloadState={downloadState}
						fallbackText={artist.name}
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
										columnCount={this.viewModel.gridColumns}
										onCardLongPress={this.handleAlbumCardLongPress}
										onCardTap={this.handleAlbumCardTap}
									/>
								</layout>
							)}

							{trackEntries.length > 0 && (
								<layout style={styles.section}>
									<label style={styles.sectionHeader} value={Strings.artistSectionTopTracks()} />
									<TrackList
										animationsEnabled={this.viewModel.animationsEnabled}
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
									logoUrl={artist.logoUrl}
									modalSlot={modalSlot}
									title={artist.name}
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
				</scroll>
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

	private closeModalSlot = (): void => {
		closeSlot(this.viewModel.modalSlot);
	};

	private handleAlbumCardTap = (card: { id: string; kind: Card['kind'] }): void => {
		const album = this.state.albums.find((candidate) => candidate.id === card.id);
		if (!album) {
			return;
		}

		const {
			animationsEnabled,
			downloadService,
			gridColumns,
			imageCache,
			modalSlot,
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
				modalSlot,
				navigationController: this.navigationController,
				onRootDetailControllerReady: () => {},
				paletteQueue,
				playbackStore,
				toastService: this.viewModel.toastService,
				transport,
			},
			{},
			{ animated: animationsEnabled },
		);
	};

	private handleAlbumCardLongPress = (card: { id: string; kind: Card['kind'] }): void => {
		const album = this.state.albums.find((candidate) => candidate.id === card.id);
		if (!album) return;

		this.setState({ contextMenuCard: { album, kind: 'album' } });
		this.contextMenuAlbumCard = card;
		const { animationsEnabled, modalSlot, playbackStore, transport } = this.viewModel;
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

	private handleAlbumContextMenuAddToPlaylist = (tracks: Array<Track>): void => {
		this.setState({ contextMenuCard: null });
		openSlot(this.viewModel.modalSlot, () => {
			<AddToPlaylistView
				animationsEnabled={this.viewModel.animationsEnabled}
				gridColumns={this.viewModel.gridColumns}
				imageCache={this.viewModel.imageCache}
				onDismiss={this.closeModalSlot}
				toastService={this.viewModel.toastService}
				tracks={tracks}
				transport={this.viewModel.transport}
			/>;
		});
	};

	private handleAlbumContextMenuCreatePlaylist = (tracks: Array<Track>): void => {
		this.pendingCreatePlaylistTracks = tracks;
		this.setState({ contextMenuCard: null });
		openSlot(this.viewModel.modalSlot, () => {
			<CreatePlaylistModal
				animationsEnabled={this.viewModel.animationsEnabled}
				onCancel={this.closeModalSlot}
				onCreate={this.handleAlbumContextMenuCreatePlaylistConfirm}
			/>;
		});
	};

	private handleAlbumContextMenuCreatePlaylistConfirm = async (name: string): Promise<void> => {
		const createPlaylistFn = this.viewModel.transport.createPlaylist.bind(this.viewModel.transport);
		const tracks = this.pendingCreatePlaylistTracks;
		if (!createPlaylistFn || !tracks) return;
		const playlist = await createPlaylistAndAddTracks(
			name,
			createPlaylistFn,
			this.viewModel.transport.addItemToPlaylist.bind(this.viewModel.transport),
			tracks,
		);
		this.pendingCreatePlaylistTracks = null;
		this.closeModalSlot();
		this.navigationController.push(
			PlaylistView,
			{
				animationsEnabled: this.viewModel.animationsEnabled,
				downloadService: this.viewModel.downloadService,
				gridColumns: this.viewModel.gridColumns,
				imageCache: this.viewModel.imageCache,
				modalSlot: this.viewModel.modalSlot,
				navigationController: this.navigationController,
				onRootDetailControllerReady: () => {},
				paletteQueue: this.viewModel.paletteQueue,
				playbackStore: this.viewModel.playbackStore,
				playlist,
				toastService: this.viewModel.toastService,
				transport: this.viewModel.transport,
			},
			{},
			{ animated: this.viewModel.animationsEnabled },
		);
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
		const {
			animationsEnabled,
			downloadService,
			gridColumns,
			imageCache,
			modalSlot,
			paletteQueue,
			playbackStore,
			transport,
		} = this.viewModel;
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
						this.navigationController.push(
							AlbumView,
							{
								album,
								animationsEnabled,
								downloadService,
								gridColumns,
								imageCache,
								modalSlot,
								navigationController: this.navigationController,
								onRootDetailControllerReady: () => {},
								paletteQueue,
								playbackStore,
								toastService: this.viewModel.toastService,
								transport,
							},
							{},
							{ animated: animationsEnabled },
						);
					}
				: undefined,
			onDismiss: () => {},
			onPlaylistCreated: (playlist) => {
				this.navigationController.push(
					PlaylistView,
					{
						animationsEnabled,
						downloadService,
						gridColumns,
						imageCache,
						modalSlot,
						navigationController: this.navigationController,
						onRootDetailControllerReady: () => {},
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

		const { artist, transport } = this.viewModel;
		this.setState({
			albums: [],
			albumsLoaded: false,
			allTracks: [],
			topTracks: [],
			topTracksLoaded: false,
		});

		Promise.all([
			transport
				.getAlbumsByArtist(artist.id)
				.then((v) => ({ status: 'fulfilled' as const, value: v }))
				.catch((r) => ({ reason: r, status: 'rejected' as const })),
			transport
				.getTracksByArtist(artist.id)
				.then((v) => ({ status: 'fulfilled' as const, value: v }))
				.catch((r) => ({ reason: r, status: 'rejected' as const })),
			transport
				.getArtistTopTracks(artist.id)
				.then((v) => ({ status: 'fulfilled' as const, value: v }))
				.catch((r) => ({ reason: r, status: 'rejected' as const })),
		]).then(([albumsResult, allTracksResult, topTracksResult]) => {
			if (this.isDestroyed() || generation !== this.loadGeneration) {
				return;
			}

			const albums =
				albumsResult.status === 'fulfilled' ? sortArtistAlbums(albumsResult.value) : [];
			const allTracks = allTracksResult.status === 'fulfilled' ? allTracksResult.value : [];
			const topTracks = topTracksResult.status === 'fulfilled' ? topTracksResult.value : [];

			this.setState({
				albums,
				albumsLoaded: true,
				allTracks,
				topTracks,
				topTracksLoaded: true,
			});
			this.viewModel.paletteQueue?.enqueueAlbums(albums);
		});
	}

	private async navigateToGenre(genre: Genre): Promise<void> {
		const resolvedGenre = await resolveGenreForNavigation(this.viewModel.transport, genre);

		if (this.isDestroyed()) {
			return;
		}

		this.navigationController.push(
			GenreView,
			{
				animationsEnabled: this.viewModel.animationsEnabled,
				downloadService: this.viewModel.downloadService,
				genre: resolvedGenre,
				gridColumns: this.viewModel.gridColumns,
				imageCache: this.viewModel.imageCache,
				modalSlot: this.viewModel.modalSlot,
				navigationController: this.navigationController,
				onRootDetailControllerReady: () => {},
				playbackStore: this.viewModel.playbackStore,
				toastService: this.viewModel.toastService,
				transport: this.viewModel.transport,
			},
			{},
			{ animated: this.viewModel.animationsEnabled },
		);
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
