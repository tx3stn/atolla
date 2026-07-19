import { StatefulComponent } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';
import type { Label, Layout, ScrollView } from 'valdi_tsx/src/NativeTemplateElements';
import type { Album } from '../../models/Album';
import type { CardDetailItem } from '../../models/App';
import type { Playlist } from '../../models/Playlist';
import type { Track } from '../../models/Track';
import Strings from '../../Strings';
import type { ImageCache } from '../../services/ImageCache';
import { getLogger } from '../../services/Logger';
import { createOnThisDayCardDetails } from '../../services/OnThisDay';
import type { OnThisDayService } from '../../services/OnThisDayService';
import type { RecentlyAddedService } from '../../services/RecentlyAddedService';
import type { ToastService } from '../../services/ToastService';
import type { TrackSource } from '../../services/TrackSource';
import type { PlaybackStore } from '../../stores/Playback';
import type { Preferences } from '../../stores/Preferences';
import { theme } from '../../theme';
import { type ConnectionMode, ConnectionModes } from '../../transports/Model';
import type { Transport } from '../../transports/Transport';
import { CancelableController } from '../../utils/CancelableController';
import { hapticFeedback } from '../../utils/Haptics';
import type { CardContextMenuCard } from '../components/CardContextMenu';
import { CardDetailList } from '../components/CardDetailList';
import { type Card, CardGrid } from '../components/CardGrid';
import { CreatePlaylistModal } from '../components/CreatePlaylistModal';
import { MixesSection } from '../components/MixesSection';
import { RefreshableScroll } from '../components/RefreshableScroll';
import { TrackList, type TrackListEntry } from '../components/TrackList';
import { openCardContextMenu } from '../flows/CardContextMenu';
import { createPlaylistAndAddTracks } from '../flows/CreatePlaylist';
import { closeSlot, openSlot } from '../flows/ModalSlotFlow';
import { openTrackContextMenu } from '../flows/TrackContextMenu';
import { AddToPlaylistView } from './AddToPlaylistView';

const log = getLogger('home');

export interface HomeViewModel {
	connectionMode: ConnectionMode;
	imageCache: ImageCache;
	modalSlot?: DetachedSlot;
	onNavigateToArtist?: (artistId: string) => void;
	onOpenAlbum: (album: Album) => void;
	onOpenPlaylist?: (playlist: Playlist) => void;
	onThisDayService?: OnThisDayService;
	playbackStore: PlaybackStore;
	preferences: Preferences;
	recentlyAddedService?: RecentlyAddedService;
	recentlyPlayedTracks: Array<Track>;
	toastService: ToastService;
	transport: Transport;
}

interface HomeState {
	contextMenuCard: CardContextMenuCard | null;
	isRefreshing: boolean;
	onThisDayAlbums: Array<Album>;
	recentlyAddedAlbums: Array<Album>;
	revision: number;
}

export class HomeView extends StatefulComponent<HomeViewModel, HomeState> {
	private loadGeneration = 0;
	private cachedRecentlyAddedCards: Array<Card> = [];
	private cachedRecentlyAddedAlbumsRef: Array<Album> | null = null;
	private cachedRecentlyAddedGridColumns = -1;
	private pendingCreatePlaylistTracks: TrackSource | null = null;
	private playlistFlow = new CancelableController(() => this.isDestroyed());
	private contextMenuAlbum: Album | null = null;
	private lastKnownGridColumns = -1;

	state: HomeState = {
		contextMenuCard: null,
		isRefreshing: false,
		onThisDayAlbums: [],
		recentlyAddedAlbums: [],
		revision: 0,
	};

	onCreate(): void {
		this.lastKnownGridColumns = this.viewModel.preferences.gridColumns;
		this.registerDisposable(this.viewModel.preferences.subscribe(this.handlePreferencesChange));
		this.registerDisposable(this.playlistFlow.cancel);
		this.loadAlbums();
	}

	onRender(): void {
		const onThisDayCards = this.createOnThisDayCards();
		const recentlyAddedCards = this.createRecentlyAddedCards();
		const recentlyPlayedTracks = this.createRecentlyPlayedEntries();

		log.debug('render', {
			onThisDay: onThisDayCards.length,
			recentlyAdded: recentlyAddedCards.length,
			recentlyPlayed: recentlyPlayedTracks.length,
		});

		<layout accessibilityLabel='home-view' style={styles.root}>
			<RefreshableScroll
				accessibilityId='home'
				isRefreshing={this.state.isRefreshing}
				onRefresh={this.handleRefresh}
				style={styles.scroll}
			>
				<layout style={styles.content}>
					<layout style={styles.section}>
						<label style={styles.sectionTitle} value={Strings.homeSectionOnThisDay()} />
						{onThisDayCards.length > 0 ? (
							<CardDetailList
								accessibilityId='home-on-this-day-grid'
								cards={onThisDayCards}
								onCardLongPress={this.handleOnThisDayCardLongPress}
								onCardTap={this.handleAlbumCardTap}
							/>
						) : (
							<label style={styles.emptyState} value={Strings.homeNoAnniversaries()} />
						)}
					</layout>

					<layout style={styles.section}>
						<label style={styles.sectionTitle} value={Strings.homeSectionRecentlyAdded()} />
						<CardGrid
							accessibilityId='home-recently-added-grid'
							cards={recentlyAddedCards}
							columnCount={this.viewModel.preferences.gridColumns}
							onCardLongPress={this.handleRecentlyAddedCardLongPress}
							onCardTap={this.handleAlbumCardTap}
						/>
					</layout>

					<layout style={styles.section}>
						<label style={styles.sectionTitle} value={Strings.homeSectionRecentlyPlayed()} />
						{recentlyPlayedTracks.length > 0 ? (
							<TrackList
								imageCache={this.viewModel.imageCache}
								onTrackLongPress={this.handleRecentlyPlayedTrackLongPress}
								onTrackTap={this.handleRecentlyPlayedTrackTap}
								tracks={recentlyPlayedTracks}
							/>
						) : (
							<label style={styles.emptyState} value={Strings.homeNothingPlayed()} />
						)}
					</layout>

					<MixesSection
						connectionMode={this.viewModel.connectionMode}
						gridColumns={this.viewModel.preferences.gridColumns}
						language={this.viewModel.preferences.language}
						playbackStore={this.viewModel.playbackStore}
						transport={this.viewModel.transport}
					/>
				</layout>
			</RefreshableScroll>
		</layout>;
	}

	onViewModelUpdate(prevViewModel?: HomeViewModel): void {
		if (!prevViewModel) {
			return;
		}

		// on the login path the per-user services arrive after this view first mounts, so reload once
		// they transition from undefined to defined rather than staying on the empty initial load
		const servicesBecameAvailable =
			(!prevViewModel.onThisDayService && !!this.viewModel.onThisDayService) ||
			(!prevViewModel.recentlyAddedService && !!this.viewModel.recentlyAddedService);

		if (
			this.viewModel.transport !== prevViewModel.transport ||
			this.viewModel.connectionMode !== prevViewModel.connectionMode ||
			servicesBecameAvailable
		) {
			log.debug('transport/mode changed, reloading', {
				connectionMode: this.viewModel.connectionMode,
				onThisDay: this.state.onThisDayAlbums.length,
			});
			this.loadAlbums();
		}
	}

	private handlePreferencesChange = (): void => {
		const gridColumns = this.viewModel.preferences.gridColumns;

		if (gridColumns !== this.lastKnownGridColumns) {
			this.lastKnownGridColumns = gridColumns;

			if (this.viewModel.connectionMode !== ConnectionModes.offline) {
				void this.loadRecentlyAdded(this.loadGeneration);
			}
		}

		this.setState({ revision: this.state.revision + 1 });
	};

	private handleRefresh = (): void => {
		if (this.state.isRefreshing) {
			return;
		}

		const generation = this.loadGeneration + 1;
		this.loadGeneration = generation;
		this.setState({ isRefreshing: true });

		const online = this.viewModel.connectionMode !== ConnectionModes.offline;
		void Promise.all([
			this.loadOnThisDay(generation, true),
			online ? this.loadRecentlyAdded(generation) : Promise.resolve(),
		]).then(() => {
			if (!this.isDestroyed()) {
				this.setState({ isRefreshing: false });
			}
		});
	};

	private loadAlbums(): void {
		const generation = this.loadGeneration + 1;
		this.loadGeneration = generation;
		void this.loadOnThisDay(generation);
		this.restoreCachedRecentlyAdded(generation);

		// offline only has downloaded albums, so keep the last full-library snapshot rather than overwrite home with the downloads subset
		if (this.viewModel.connectionMode !== ConnectionModes.offline) {
			void this.loadRecentlyAdded(generation);
		}
	}

	// shows cached anniversary albums immediately, then (online) rebuilds in the background via OnThisDayService and re-renders from its own state, so display never depends on a parent re-render arriving at the right moment
	private loadOnThisDay(generation: number, force = false): Promise<void> {
		const service = this.viewModel.onThisDayService;
		if (!service) {
			return Promise.resolve();
		}

		return service
			.ensureLoaded()
			.then(() => {
				if (this.isDestroyed() || generation !== this.loadGeneration) {
					return;
				}
				const cached = service.getAlbumsForDate(new Date());
				log.debug('on-this-day from cache', { count: cached.length });
				this.setState({ onThisDayAlbums: cached });

				// offline only has downloaded albums, so keep the cached snapshot
				if (this.viewModel.connectionMode === ConnectionModes.offline) {
					return undefined;
				}

				return service.refresh(this.viewModel.transport, new Date(), { force }).then((summary) => {
					if (this.isDestroyed() || generation !== this.loadGeneration) {
						return;
					}
					log.debug('on-this-day refreshed', summary);
					this.setState({ onThisDayAlbums: service.getAlbumsForDate(new Date()) });
				});
			})
			.catch(() => {});
	}

	private restoreCachedRecentlyAdded(generation: number): void {
		const service = this.viewModel.recentlyAddedService;
		if (!service) {
			return;
		}

		void service
			.loadCached()
			.then((cachedAlbums) => {
				if (this.isDestroyed() || generation !== this.loadGeneration) {
					return;
				}
				if (cachedAlbums.length === 0) {
					return;
				}

				if (this.state.recentlyAddedAlbums.length === 0) {
					this.setState({ recentlyAddedAlbums: cachedAlbums });
				}
			})
			.catch(() => {});
	}

	private loadRecentlyAdded(generation: number): Promise<void> {
		const service = this.viewModel.recentlyAddedService;
		if (!service) {
			return Promise.resolve();
		}

		const limit = Math.max(1, this.viewModel.preferences.gridColumns) * 2;
		return service
			.refresh(this.viewModel.transport, limit)
			.then((albums) => {
				if (this.isDestroyed() || generation !== this.loadGeneration) {
					return;
				}
				this.setState({ recentlyAddedAlbums: albums });
			})
			.catch(() => {});
	}

	private createOnThisDayCards(): Array<CardDetailItem> {
		return createOnThisDayCardDetails(this.state.onThisDayAlbums, new Date());
	}

	private findHomeAlbum(id: string): Album | undefined {
		return (
			this.state.recentlyAddedAlbums.find((album) => album.id === id) ??
			this.state.onThisDayAlbums.find((album) => album.id === id)
		);
	}

	private createRecentlyAddedCards(): Array<Card> {
		const { gridColumns } = this.viewModel.preferences;
		if (
			this.state.recentlyAddedAlbums === this.cachedRecentlyAddedAlbumsRef &&
			gridColumns === this.cachedRecentlyAddedGridColumns
		) {
			return this.cachedRecentlyAddedCards;
		}

		this.cachedRecentlyAddedAlbumsRef = this.state.recentlyAddedAlbums;
		this.cachedRecentlyAddedGridColumns = gridColumns;
		this.cachedRecentlyAddedCards = this.state.recentlyAddedAlbums.map((album) => ({
			artworkKey: album.imageUrl ?? '',
			id: album.id,
			kind: 'album' as const,
			primaryText: album.name,
			secondaryText: album.artistName,
		}));
		return this.cachedRecentlyAddedCards;
	}

	private createRecentlyPlayedEntries(): Array<TrackListEntry> {
		return this.viewModel.recentlyPlayedTracks.slice(0, 5).map((track, index) => ({
			artworkSource: track.albumImageUrl ?? null,
			id: track.id,
			leadingLabel: String(index + 1),
			meta: track.artistName ?? track.albumName ?? '',
			title: track.name,
			track,
		}));
	}

	private handleAlbumCardTap = (card: {
		id: string;
		kind: 'album' | 'artist' | 'genre' | 'playlist';
	}): void => {
		if (card.kind !== 'album') {
			return;
		}

		const album = this.findHomeAlbum(card.id);
		if (!album) {
			return;
		}

		this.viewModel.onOpenAlbum(album);
	};

	private handleRecentlyPlayedTrackTap = (trackId: string): void => {
		const queue = this.viewModel.recentlyPlayedTracks.slice(0, 5);
		const trackIndex = queue.findIndex((track) => track.id === trackId);
		if (trackIndex < 0) {
			return;
		}

		this.viewModel.playbackStore.playTracks(queue, trackIndex);
	};

	private handleRecentlyPlayedTrackLongPress = (track: Track): void => {
		openTrackContextMenu(track, this.viewModel.modalSlot, {
			animationsEnabled: this.viewModel.preferences.animationsEnabled,
			gridColumns: this.viewModel.preferences.gridColumns,
			imageCache: this.viewModel.imageCache,
			onAlbumTap: track.albumId
				? () =>
						this.viewModel.onOpenAlbum({
							artistId: track.artistId ?? '',
							artistName: track.artistName ?? '',
							id: track.albumId as string,
							imageUrl: track.albumImageUrl,
							name: track.albumName ?? '',
						})
				: undefined,
			onArtistTap:
				this.viewModel.onNavigateToArtist && track.artistId
					? () => this.viewModel.onNavigateToArtist?.(track.artistId as string)
					: undefined,
			onDismiss: () => {
				this.contextMenuAlbum = null;
				this.setState({ contextMenuCard: null });
			},
			onPlaylistCreated: (playlist) => {
				this.viewModel.onOpenPlaylist?.(playlist);
			},
			playbackStore: this.viewModel.playbackStore,
			toastService: this.viewModel.toastService,
			transport: this.viewModel.transport,
		});
	};

	private closeModalSlot = (): void => {
		closeSlot(this.viewModel.modalSlot);
	};

	private handleContextMenuDismiss = (): void => {
		closeSlot(this.viewModel.modalSlot);
		this.contextMenuAlbum = null;
		this.setState({ contextMenuCard: null });
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

	private handleAlbumContextMenuArtistTap = (): void => {
		const album = this.contextMenuAlbum;
		if (!album?.artistId) return;
		this.handleContextMenuDismiss();
		this.viewModel.onNavigateToArtist?.(album.artistId);
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
			this.viewModel.onOpenPlaylist?.(playlist);
		} catch {
			if (this.isDestroyed()) return;
			this.pendingCreatePlaylistTracks = null;
			this.closeModalSlot();
		}
	};

	private handleAlbumContextMenuEntityTap = (): void => {
		const album = this.contextMenuAlbum;
		if (!album) return;
		this.handleContextMenuDismiss();
		this.viewModel.onOpenAlbum(album);
	};

	private openAlbumCardContextMenu(album: Album): void {
		const { modalSlot, playbackStore, transport } = this.viewModel;
		const { animationsEnabled } = this.viewModel.preferences;
		openCardContextMenu(modalSlot, {
			animationsEnabled,
			card: { album, kind: 'album' },
			onAddToPlaylist: this.handleAlbumContextMenuAddToPlaylist,
			onArtistTap: album.artistId ? this.handleAlbumContextMenuArtistTap : undefined,
			onCreatePlaylist: this.handleAlbumContextMenuCreatePlaylist,
			onDismiss: this.handleContextMenuDismiss,
			onEntityTap: this.handleAlbumContextMenuEntityTap,
			playbackStore,
			transport,
		});
	}

	private handleRecentlyAddedCardLongPress = (card: {
		id: string;
		kind: 'album' | 'artist' | 'genre' | 'playlist';
	}): void => {
		const album = this.findHomeAlbum(card.id);
		if (!album) return;

		this.setState({ contextMenuCard: { album, kind: 'album' } });
		this.contextMenuAlbum = album;
		this.openAlbumCardContextMenu(album);
	};

	private handleOnThisDayCardLongPress = (card: {
		id: string;
		kind: 'album' | 'artist' | 'genre' | 'playlist';
	}): void => {
		const album = this.findHomeAlbum(card.id);
		if (!album) return;
		hapticFeedback();

		this.setState({ contextMenuCard: { album, kind: 'album' } });
		this.contextMenuAlbum = album;
		this.openAlbumCardContextMenu(album);
	};
}

const styles = {
	content: new Style<Layout>({
		paddingBottom: 18,
		paddingLeft: 14,
		paddingRight: 14,
		paddingTop: theme.headerHeight + theme.padding.deviceInset + 8,
		width: '100%',
	}),
	emptyState: new Style<Label>({
		...theme.text.sub,
		marginTop: 6,
	}),
	root: new Style<Layout>({
		flexGrow: 1,
		width: '100%',
	}),
	scroll: new Style<ScrollView>({
		backgroundColor: theme.colors.bg,
		flexGrow: 1,
		paddingBottom: theme.padding.scrollBottom,
		width: '100%',
	}),
	section: new Style<Layout>({
		marginBottom: 24,
		width: '100%',
	}),
	sectionTitle: new Style<Label>({
		...theme.text.mainBold,
		marginBottom: 8,
	}),
};
