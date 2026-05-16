import { Style } from 'valdi_core/src/Style';
import type { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';
import { DetachedSlotRenderer } from 'valdi_core/src/slot/DetachedSlotRenderer';
import { INavigatorPageVisibility } from 'valdi_navigation/src/INavigator';
import { NavigationPage } from 'valdi_navigation/src/NavigationPage';
import { NavigationPageStatefulComponent } from 'valdi_navigation/src/NavigationPageComponent';
import type { Label, Layout, ScrollView, View } from 'valdi_tsx/src/NativeTemplateElements';
import type { Album } from '../../models/Album';
import type { Artist } from '../../models/Artist';
import type { Genre } from '../../models/Genre';
import type { Track } from '../../models/Track';
import Strings from '../../Strings';
import type { DownloadService, DownloadState } from '../../services/DownloadService';
import type { ImageCache } from '../../services/ImageCache';
import type { PaletteGenerationQueue } from '../../services/PaletteGenerationQueue';
import { type PlaybackStore, shuffleArray } from '../../stores/Playback';
import { scrollPaddingBottom, theme, topInset } from '../../theme';
import type { Transport } from '../../transports/Transport';
import { BioSection } from '../components/BioSection';
import { CardContextMenu, type CardContextMenuCard } from '../components/CardContextMenu';
import { type Card, CardGrid } from '../components/CardGrid';
import { CreatePlaylistModal } from '../components/CreatePlaylistModal';
import { DetailHeader } from '../components/DetailHeader';
import { FooterNav } from '../components/FooterNav';
import type { FooterTab } from '../components/FooterTab';
import { GenrePills } from '../components/GenrePills';
import { mergeGenreCollections } from '../components/GenrePillsData';
import type { HeaderTab } from '../components/HeaderTabs';
import { LibraryHeaderNav } from '../components/LibraryHeaderNav';
import { LoadingView } from '../components/LoadingView';
import { TrackContextMenu } from '../components/TrackContextMenu';
import { TrackList, type TrackListEntry } from '../components/TrackList';
import { closeSlot, openSlot } from '../flows/modalSlotFlow';
import { createPlaylistAndAddTracks } from '../flows/playlistFlow';
import type { NavBarContext } from '../NavBarContext';
import { AddToPlaylistView } from './AddToPlaylistView';
import { AlbumView } from './AlbumView';
import { sortArtistAlbums } from './ArtistViewSort';
import { resolveGenreForNavigation, resolveGenreImageUrls } from './GenreNavigationResolver';
import { GenreView } from './GenreView';
import type { LibraryNavContext } from './LibraryView';
import { PlaylistView } from './PlaylistView';

export interface ArtistViewModel {
	animationsEnabled: boolean;
	artist: Artist;
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

interface ArtistState {
	albums: Array<Album>;
	albumsLoaded: boolean;
	allTracks: Array<Track>;
	contextMenuCard: CardContextMenuCard | null;
	contextMenuTrack: Track | null;
	downloadState: DownloadState;
	isFooterVisible: boolean;
	isHeaderVisible: boolean;
	topTracks: Array<Track>;
	topTracksLoaded: boolean;
}

@NavigationPage(module)
export class ArtistView extends NavigationPageStatefulComponent<ArtistViewModel, ArtistState> {
	private hasBeenDestroyed = false;
	private loadGeneration = 0;
	private pendingCreatePlaylistTracks: Array<Track> | null = null;
	private pendingCreatePlaylistTrack: Track | null = null;
	private contextMenuAlbumCard: { id: string; kind: Card['kind'] } | null = null;
	private unsubscribePlayback?: () => void;
	private unsubscribeDownloads?: () => void;
	private readonly setHeaderVisibility = (isVisible: boolean): void => {
		if (this.state.isHeaderVisible === isVisible) {
			return;
		}

		this.setState({ isHeaderVisible: isVisible });
		this.viewModel.onHeaderVisibilityChange?.(isVisible);
	};
	state: ArtistState = {
		albums: [],
		albumsLoaded: false,
		allTracks: [],
		contextMenuCard: null,
		contextMenuTrack: null,
		downloadState: 'not_downloaded',
		isFooterVisible: false,
		isHeaderVisible: false,
		topTracks: [],
		topTracksLoaded: false,
	};

	handleTrackLongPress = (track: Track): void => {
		this.setState({ contextMenuTrack: track });
		const modalSlot = this.viewModel.navBarContext?.modalSlot ?? this.viewModel.modalSlot;
		const { animationsEnabled, imageCache, playbackStore, transport } = this.viewModel;
		const canCreatePlaylist = Boolean(transport.createPlaylist);
		modalSlot?.slotted(() => {
			<TrackContextMenu
				animationsEnabled={animationsEnabled}
				imageCache={imageCache}
				onAddToPlaylist={this.handleTrackContextMenuAddToPlaylist}
				onAlbumTap={track.albumId ? this.handleContextMenuAlbumTap : undefined}
				onCreatePlaylist={canCreatePlaylist ? this.handleTrackContextMenuCreatePlaylist : undefined}
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
				navBarContext: this.buildChildNavBarContext(),
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
		closeSlot(this.viewModel.navBarContext?.modalSlot ?? this.viewModel.modalSlot);
		this.contextMenuAlbumCard = null;
		this.setState({ contextMenuCard: null, contextMenuTrack: null });
	};

	private closeModalSlot = (): void => {
		closeSlot(this.viewModel.navBarContext?.modalSlot ?? this.viewModel.modalSlot);
	};

	private handleTrackContextMenuAddToPlaylist = (): void => {
		const track = this.state.contextMenuTrack;
		if (!track) return;
		this.setState({ contextMenuTrack: null });
		openSlot(this.viewModel.navBarContext?.modalSlot ?? this.viewModel.modalSlot, () => {
			<AddToPlaylistView
				animationsEnabled={this.viewModel.animationsEnabled}
				gridColumns={this.viewModel.gridColumns}
				imageCache={this.viewModel.imageCache}
				onDismiss={this.closeModalSlot}
				tracks={[track]}
				transport={this.viewModel.transport}
			/>;
		});
	};

	private handleTrackContextMenuCreatePlaylist = (): void => {
		const track = this.state.contextMenuTrack;
		if (!track) return;
		this.pendingCreatePlaylistTrack = track;
		this.setState({ contextMenuTrack: null });
		openSlot(this.viewModel.navBarContext?.modalSlot ?? this.viewModel.modalSlot, () => {
			<CreatePlaylistModal
				onCancel={this.closeModalSlot}
				onCreate={this.handleTrackContextMenuCreatePlaylistConfirm}
			/>;
		});
	};

	private handleTrackContextMenuCreatePlaylistConfirm = async (name: string): Promise<void> => {
		const track = this.pendingCreatePlaylistTrack;
		const createPlaylistFn = this.viewModel.transport.createPlaylist?.bind(
			this.viewModel.transport,
		);
		if (!track || !createPlaylistFn) return;
		const playlist = await createPlaylistFn(name, track.id);
		this.pendingCreatePlaylistTrack = null;
		this.closeModalSlot();
		this.navigationController.push(
			PlaylistView,
			{
				animationsEnabled: this.viewModel.animationsEnabled,
				downloadService: this.viewModel.downloadService,
				gridColumns: this.viewModel.gridColumns,
				imageCache: this.viewModel.imageCache,
				navBarContext: this.buildChildNavBarContext(),
				paletteQueue: this.viewModel.paletteQueue,
				playbackStore: this.viewModel.playbackStore,
				playlist,
				transport: this.viewModel.transport,
			},
			{},
			{ animated: this.viewModel.animationsEnabled },
		);
	};

	handleHeaderPlayTap = (): void => {
		const { artist, playbackStore } = this.viewModel;
		playbackStore.playTracks(this.state.allTracks);
		playbackStore.setArtistLogoUrl(artist.logoUrl || null);
	};

	handleHeaderShuffleTap = (): void => {
		const { artist, playbackStore } = this.viewModel;
		playbackStore.playTracks(shuffleArray(this.state.allTracks));
		playbackStore.setArtistLogoUrl(artist.logoUrl || null);
	};

	handleDownloadTap = (): void => {
		const { artist, downloadService, transport } = this.viewModel;
		const artistLogoUrlPromise = artist.logoUrl
			? Promise.resolve(artist.logoUrl)
			: transport.getArtistLogoUrl(artist.id).catch(() => null);

		const albumEntriesPromise = Promise.all(
			this.state.albums.map((album) =>
				transport.getTracksByAlbum(album.id).then((tracks) => ({
					album,
					tracks: tracks
						.map((track) => {
							const streamUrl = transport.getTrackCacheUrl?.(track.id);
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

	handleRemoveDownloadTap = (): void => {
		this.viewModel.downloadService.removeArtistDownload(this.viewModel.artist.id);
	};

	handleHeaderAddToQueueTap = (): Promise<void> => {
		this.viewModel.playbackStore.addToQueue(this.state.allTracks);
		return Promise.resolve();
	};

	handleTopTrackTap = (trackId: string): void => {
		const { artist, playbackStore } = this.viewModel;
		const trackIndex = this.state.topTracks.findIndex((track) => track.id === trackId);
		if (trackIndex < 0) {
			return;
		}

		playbackStore.playTracks(this.state.topTracks, trackIndex);
		playbackStore.setArtistLogoUrl(artist.logoUrl || null);
	};

	handleAlbumCardTap = (card: { id: string; kind: Card['kind'] }): void => {
		const album = this.state.albums.find((candidate) => candidate.id === card.id);
		if (!album) {
			return;
		}

		const {
			animationsEnabled,
			downloadService,
			gridColumns,
			imageCache,
			onNavigationContext,
			paletteQueue,
			playbackStore,
			transport,
		} = this.viewModel;
		onNavigationContext?.({ album, kind: 'album' });
		this.setHeaderVisibility(false);
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
				navBarContext: this.buildChildNavBarContext(),
				onHeaderVisibilityChange: this.viewModel.onHeaderVisibilityChange,
				onNavigationContext,
				paletteQueue,
				playbackStore,
				restoreHeaderOnDestroy: false,
				transport,
			},
			{},
			{ animated: animationsEnabled },
		);
	};

	handleAlbumCardLongPress = (card: { id: string; kind: Card['kind'] }): void => {
		const album = this.state.albums.find((candidate) => candidate.id === card.id);
		if (!album) return;

		this.setState({ contextMenuCard: { album, kind: 'album' } });
		this.contextMenuAlbumCard = card;
		const modalSlot = this.viewModel.navBarContext?.modalSlot ?? this.viewModel.modalSlot;
		const { animationsEnabled, imageCache, playbackStore, transport } = this.viewModel;
		const canCreatePlaylist = Boolean(transport.createPlaylist);

		modalSlot?.slotted(() => {
			<CardContextMenu
				animationsEnabled={animationsEnabled}
				card={{ album, kind: 'album' }}
				imageCache={imageCache}
				onAddToPlaylist={this.handleAlbumContextMenuAddToPlaylist}
				onCreatePlaylist={canCreatePlaylist ? this.handleAlbumContextMenuCreatePlaylist : undefined}
				onDismiss={this.handleContextMenuDismiss}
				onEntityTap={this.handleAlbumContextMenuEntityTap}
				playbackStore={playbackStore}
				transport={transport}
			/>;
		});
	};

	private handleAlbumContextMenuAddToPlaylist = (tracks: Array<Track>): void => {
		this.setState({ contextMenuCard: null });
		openSlot(this.viewModel.navBarContext?.modalSlot ?? this.viewModel.modalSlot, () => {
			<AddToPlaylistView
				animationsEnabled={this.viewModel.animationsEnabled}
				gridColumns={this.viewModel.gridColumns}
				imageCache={this.viewModel.imageCache}
				onDismiss={this.closeModalSlot}
				tracks={tracks}
				transport={this.viewModel.transport}
			/>;
		});
	};

	private handleAlbumContextMenuCreatePlaylist = (tracks: Array<Track>): void => {
		this.pendingCreatePlaylistTracks = tracks;
		this.setState({ contextMenuCard: null });
		openSlot(this.viewModel.navBarContext?.modalSlot ?? this.viewModel.modalSlot, () => {
			<CreatePlaylistModal
				onCancel={this.closeModalSlot}
				onCreate={this.handleAlbumContextMenuCreatePlaylistConfirm}
			/>;
		});
	};

	private handleAlbumContextMenuCreatePlaylistConfirm = async (name: string): Promise<void> => {
		const createPlaylistFn = this.viewModel.transport.createPlaylist?.bind(
			this.viewModel.transport,
		);
		const tracks = this.pendingCreatePlaylistTracks;
		if (!createPlaylistFn || !tracks) return;
		const playlist = await createPlaylistAndAddTracks(
			name,
			createPlaylistFn,
			this.viewModel.transport.addItemToPlaylist?.bind(this.viewModel.transport),
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
				navBarContext: this.buildChildNavBarContext(),
				paletteQueue: this.viewModel.paletteQueue,
				playbackStore: this.viewModel.playbackStore,
				playlist,
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

	handleGenreTap = (genre: Genre): void => {
		void this.navigateToGenre(genre);
	};

	private async navigateToGenre(genre: Genre): Promise<void> {
		const {
			animationsEnabled,
			downloadService,
			imageCache,
			onNavigationContext,
			playbackStore,
			transport,
		} = this.viewModel;
		const resolvedGenre = await resolveGenreForNavigation(transport, genre);

		if (this.hasBeenDestroyed) {
			return;
		}

		onNavigationContext?.({ genre: resolvedGenre, kind: 'genre' });
		this.setHeaderVisibility(false);
		this.navigationController.push(
			GenreView,
			{
				animationsEnabled,
				downloadService,
				genre: resolvedGenre,
				gridColumns: this.viewModel.gridColumns,
				imageCache,
				navBarContext: this.buildChildNavBarContext(),
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
			downloadState: this.viewModel.downloadService.getArtistDownloadState(
				this.viewModel.artist.id,
			),
		});
	}

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
			if (this.hasBeenDestroyed || generation !== this.loadGeneration) {
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
		const isFooterVisible = playbackStore.track !== null;
		if (isFooterVisible !== this.state.isFooterVisible) {
			this.setState({ isFooterVisible });
		}
		this.syncDownloadState();
		this.loadArtistData();
	}

	onViewModelUpdate(prevViewModel?: ArtistViewModel): void {
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
			this.viewModel.artist.id !== prevViewModel.artist.id
		) {
			this.loadArtistData();
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

	// When a child view (AlbumView, GenreView, PlaylistView) taps a header tab, it only pops
	// itself. Wrapping onTabTap here ensures ArtistView also pops before handing control to
	// the library, so the user lands back in the library rather than on the artist detail page.
	private buildChildNavBarContext(): NavBarContext | undefined {
		const { navBarContext } = this.viewModel;
		if (!navBarContext) return undefined;
		return {
			...navBarContext,
			header: navBarContext.header
				? {
						...navBarContext.header,
						onTabTap: (tab: HeaderTab) => {
							this.viewModel.onHeaderVisibilityChange?.(true);
							this.navigationController.pop();
							navBarContext.header?.onTabTap(tab);
						},
					}
				: undefined,
		};
	}

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
		const { artist, animationsEnabled, imageCache } = this.viewModel;
		const modalSlot = this.viewModel.navBarContext?.modalSlot ?? this.viewModel.modalSlot;
		const {
			albums,
			albumsLoaded,
			allTracks,
			downloadState,
			isFooterVisible,
			isHeaderVisible,
			topTracks,
			topTracksLoaded,
		} = this.state;

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

		const scrollStyle = createScrollStyle(isFooterVisible, isHeaderVisible);
		const isLoading = !albumsLoaded || !topTracksLoaded;
		const artistGenres = mergeGenreCollections([
			artist.genres,
			...albums.map((album) => album.genres),
		]);

		<layout accessibilityLabel='artist-view' style={styles.root}>
			<view accessibilityId='artist-view' style={styles.fullScreen}>
				<scroll style={scrollStyle}>
					<DetailHeader
						animationsEnabled={animationsEnabled}
						artworkCategory='artist_image'
						artworkSource={artist.imageUrl ?? null}
						downloadState={downloadState}
						fallbackText={artist.name}
						imageCache={imageCache}
						logoSource={artist.logoUrl || null}
						modalSlot={this.viewModel.navBarContext?.modalSlot ?? this.viewModel.modalSlot}
						onAddToQueue={allTracks.length > 0 ? this.handleHeaderAddToQueueTap : undefined}
						onDownload={this.handleDownloadTap}
						onHideHeaderGesture={this.handleHideHeaderGesture}
						onPlay={allTracks.length > 0 ? this.handleHeaderPlayTap : undefined}
						onRemoveDownload={this.handleRemoveDownloadTap}
						onRevealHeaderGesture={this.handleRevealHeaderGesture}
						onShuffle={allTracks.length > 0 ? this.handleHeaderShuffleTap : undefined}
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
										tracks={trackEntries}
									/>
								</layout>
							)}

							{artist.bio && (
								<BioSection
									bio={artist.bio}
									logoUrl={artist.logoUrl}
									modalSlot={this.viewModel.navBarContext?.modalSlot ?? this.viewModel.modalSlot}
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
