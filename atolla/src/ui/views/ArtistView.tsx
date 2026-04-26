import { Style } from 'valdi_core/src/Style';
import { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';
import { DetachedSlotRenderer } from 'valdi_core/src/slot/DetachedSlotRenderer';
import { NavigationPage } from 'valdi_navigation/src/NavigationPage';
import { NavigationPageStatefulComponent } from 'valdi_navigation/src/NavigationPageComponent';
import type { Label, Layout, ScrollView } from 'valdi_tsx/src/NativeTemplateElements';
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
import { type Card, CardGrid } from '../components/CardGrid';
import { DetailHeader } from '../components/DetailHeader';
import { FooterNav } from '../components/FooterNav';
import { GenrePills } from '../components/GenrePills';
import { mergeGenreCollections } from '../components/GenrePillsData';
import { LibraryHeaderNav } from '../components/LibraryHeaderNav';
import { LoadingView } from '../components/LoadingView';
import { TrackContextMenu } from '../components/TrackContextMenu';
import { TrackList, type TrackListEntry } from '../components/TrackList';
import type { NavBarContext } from '../NavBarContext';
import { AlbumView } from './AlbumView';
import { sortArtistAlbums } from './ArtistViewSort';
import { resolveGenreForNavigation } from './GenreNavigationResolver';
import { GenreView } from './GenreView';
import type { LibraryNavContext } from './LibraryView';

export interface ArtistViewModel {
	animationsEnabled: boolean;
	artist: Artist;
	downloadService: DownloadService;
	gridColumns: number;
	imageCache: ImageCache;
	isHeaderVisible?: boolean;
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
	contextMenuTrack: Track | null;
	downloadState: DownloadState;
	isFooterVisible: boolean;
	isHeaderVisible: boolean;
	topTracks: Array<Track>;
	topTracksLoaded: boolean;
}

@NavigationPage(module)
export class ArtistView extends NavigationPageStatefulComponent<ArtistViewModel, ArtistState> {
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
	state: ArtistState = {
		albums: [],
		albumsLoaded: false,
		allTracks: [],
		contextMenuTrack: null,
		downloadState: 'not_downloaded',
		isFooterVisible: false,
		isHeaderVisible: false,
		topTracks: [],
		topTracksLoaded: false,
	};

	handleTrackLongPress = (track: Track): void => {
		this.setState({ contextMenuTrack: track });
	};

	handleContextMenuDismiss = (): void => {
		this.setState({ contextMenuTrack: null });
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

		Promise.all([
			artistLogoUrlPromise,
			Promise.all(
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
			),
		]).then(([artistLogoUrl, albumEntries]) => {
			downloadService.downloadArtistAlbums({ albumEntries, artist, artistLogoUrl });
		});
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
				navBarContext: this.viewModel.navBarContext,
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
		if (!album) {
			return;
		}

		this.viewModel.transport.getTracksByAlbum(album.id).then((tracks) => {
			if (tracks.length === 0) {
				return;
			}

			this.viewModel.playbackStore.play(tracks, album);
			this.viewModel.playbackStore.setArtistLogoUrl(this.viewModel.artist.logoUrl || null);
		});
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
				imageCache,
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
		this.hasBeenDestroyed = false;
		this.viewModel.onHeaderVisibilityChange?.(false);
		this.setHeaderVisibility(false);
		const { downloadService, playbackStore } = this.viewModel;
		this.unsubscribePlayback = playbackStore.subscribe(() => {
			const isFooterVisible = playbackStore.track !== null;
			if (isFooterVisible !== this.state.isFooterVisible) {
				this.setState({ isFooterVisible });
			}
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
		const { artist, animationsEnabled, imageCache, playbackStore, transport } = this.viewModel;
		const {
			albums,
			albumsLoaded,
			allTracks,
			contextMenuTrack,
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

		const { navBarContext } = this.viewModel;
		const scrollStyle = createScrollStyle(isFooterVisible, isHeaderVisible);
		const isLoading = !albumsLoaded || !topTracksLoaded;
		const artistGenres = mergeGenreCollections([
			artist.genres,
			...albums.map((album) => album.genres),
		]);

		<layout accessibilityLabel='artist-view' style={styles.root}>
			<scroll style={scrollStyle}>
				<DetailHeader
					animationsEnabled={animationsEnabled}
					artworkCategory='artist_image'
					artworkSource={artist.imageUrl ?? null}
					downloadState={downloadState}
					fallbackText={artist.name}
					imageCache={imageCache}
					logoSource={artist.logoUrl || null}
					modalSlot={this.modalSlot}
					onAddToQueue={allTracks.length > 0 ? this.handleHeaderAddToQueueTap : undefined}
					onDownload={this.handleDownloadTap}
					onHideHeaderGesture={() => {
						this.setHeaderVisibility(false);
					}}
					onPlay={allTracks.length > 0 ? this.handleHeaderPlayTap : undefined}
					onRemoveDownload={this.handleRemoveDownloadTap}
					onRevealHeaderGesture={() => {
						this.setHeaderVisibility(true);
					}}
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
									accessibilityLabel='artist-albums-grid'
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
								modalSlot={this.modalSlot}
								title={artist.name}
							/>
						)}

						{artistGenres.length > 0 && (
							<GenrePills
								accessibilityLabel='artist-genres'
								genres={artistGenres}
								onGenreTap={this.handleGenreTap}
							/>
						)}
					</layout>
				)}
			</scroll>
			{contextMenuTrack && (
				<TrackContextMenu
					animationsEnabled={animationsEnabled}
					imageCache={imageCache}
					onDismiss={this.handleContextMenuDismiss}
					playbackStore={playbackStore}
					track={contextMenuTrack}
					transport={transport}
				/>
			)}
			<DetachedSlotRenderer detachedSlot={this.modalSlot} />
			{navBarContext && (
				<FooterNav
					activeTab={navBarContext.activeFooterTab}
					downloadingCount={navBarContext.downloadingCount}
					onFooterTabTap={navBarContext.onFooterTabTap}
				/>
			)}
			{navBarContext?.header && isHeaderVisible && (
				<LibraryHeaderNav
					activeTab={navBarContext.header.activeTab}
					animationsEnabled={navBarContext.header.animationsEnabled}
					connectionMode={navBarContext.header.connectionMode}
					onAlphabetLetterTap={navBarContext.header.onAlphabetLetterTap}
					onRequestModeChange={navBarContext.header.onRequestModeChange}
					onSortChange={navBarContext.header.onSortChange}
					onTabTap={navBarContext.header.onTabTap}
				/>
			)}
		</layout>;
	}
}

const styles = {
	content: new Style({
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
