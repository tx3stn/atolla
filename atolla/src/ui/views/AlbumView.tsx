import { Style } from 'valdi_core/src/Style';
import type { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';
import { INavigatorPageVisibility } from 'valdi_navigation/src/INavigator';
import type { NavigationController } from 'valdi_navigation/src/NavigationController';
import { NavigationPage } from 'valdi_navigation/src/NavigationPage';
import { NavigationPageStatefulComponent } from 'valdi_navigation/src/NavigationPageComponent';
import type { Label, ScrollView, View } from 'valdi_tsx/src/NativeTemplateElements';
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
import { formatReleaseDate } from '../../utils/Date';
import { formatDuration } from '../../utils/Time';
import { groupTracksByDisc } from '../components/AlbumDiscGrouping';
import { BioSection } from '../components/BioSection';
import { DetailHeader } from '../components/DetailHeader';
import { GenrePills } from '../components/GenrePills';
import { normalizeGenres } from '../components/GenrePillsData';
import { LoadingView } from '../components/LoadingView';
import { TrackList, type TrackListEntry } from '../components/TrackList';
import { resolveGenreForNavigation, resolveGenreImageUrls } from '../flows/GenreNavigationResolver';
import { openTrackContextMenu } from '../flows/TrackContextMenu';
import { ArtistView } from './ArtistView';
import { GenreView } from './GenreView';
import { PlaylistView } from './PlaylistView';

export interface AlbumViewModel {
	album: Album;
	animationsEnabled: boolean;
	downloadService: DownloadService;
	gridColumns: number;
	imageCache: ImageCache;
	modalSlot: DetachedSlot;
	navigationController: NavigationController;
	onRootDetailControllerReady: (controller: NavigationController) => void;
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
	isLoading: boolean;
	tracks: Array<Track>;
}

@NavigationPage(module)
export class AlbumView extends NavigationPageStatefulComponent<AlbumViewModel, AlbumState> {
	private loadGeneration = 0;

	state: AlbumState = {
		artist: null,
		artistLogoUrl: null,
		downloadState: 'not_downloaded',
		fullAlbum: null,
		isLoading: true,
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
		this.syncDownloadState();
		this.loadAlbumData();
	}

	onRender(): void {
		const { artistLogoUrl, downloadState, fullAlbum, isLoading, tracks } = this.state;
		const { album: partialAlbum, animationsEnabled, imageCache, modalSlot } = this.viewModel;
		const album = fullAlbum ?? partialAlbum;
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

		<layout accessibilityLabel='album-view' style={styles.root}>
			<view accessibilityId='album-view' style={styles.fullScreen}>
				<scroll
					onScroll={(event) => this.headerCollapse.handleScroll(event.y)}
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
					{album.bio && <BioSection bio={album.bio} modalSlot={modalSlot} title={album.name} />}
					{albumGenres.length > 0 && (
						<GenrePills
							accessibilityId='album-genres'
							genres={albumGenres}
							onGenreTap={this.handleGenreTap}
						/>
					)}
				</scroll>
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

		this.navigationController.push(
			ArtistView,
			{
				animationsEnabled: this.viewModel.animationsEnabled,
				artist,
				downloadService: this.viewModel.downloadService,
				gridColumns: this.viewModel.gridColumns,
				imageCache: this.viewModel.imageCache,
				modalSlot: this.viewModel.modalSlot,
				navigationController: this.navigationController,
				onNavigationControllerReady: () => {},
				paletteQueue: this.viewModel.paletteQueue,
				playbackStore: this.viewModel.playbackStore,
				toastService: this.viewModel.toastService,
				transport: this.viewModel.transport,
			},
			{},
			{ animated: this.viewModel.animationsEnabled },
		);
	};

	handleHeaderPlayTap = (): void => {
		if (this.state.tracks.length === 0) return;

		this.viewModel.playbackStore.play(this.state.tracks, this.viewModel.album);
		this.viewModel.playbackStore.setArtistLogoUrl(this.state.artistLogoUrl);
	};

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

	private handleRemoveDownloadTap = (): void => {
		this.viewModel.downloadService.removeAlbumDownload(this.viewModel.album.id);
	};

	private handleTrackLongPress = (track: Track): void => {
		const {
			animationsEnabled,
			downloadService,
			gridColumns,
			imageCache,
			paletteQueue,
			playbackStore,
			transport,
		} = this.viewModel;

		openTrackContextMenu(track, this.viewModel.modalSlot, {
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
						modalSlot: this.viewModel.modalSlot,
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

	private async navigateToGenre(genre: Genre): Promise<void> {
		const { animationsEnabled, downloadService, imageCache, playbackStore, transport } =
			this.viewModel;
		const navigationController = this.navigationController;
		const resolvedGenre = await resolveGenreForNavigation(transport, genre);

		if (this.isDestroyed()) {
			return;
		}

		navigationController.push(
			GenreView,
			{
				animationsEnabled,
				downloadService,
				genre: resolvedGenre,
				imageCache,
				modalSlot: this.viewModel.modalSlot,
				navigationController: this.navigationController,
				onRootDetailControllerReady: () => {},
				playbackStore,
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
	scroll: new Style<ScrollView>({
		backgroundColor: theme.colors.bg,
		flexGrow: 1,
		padding: 8,
		paddingBottom: theme.padding.scrollBottom,
		paddingTop: theme.padding.scrollHeader(true),
		width: '100%',
	}),
};
