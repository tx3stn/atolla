import type { Album } from 'atolla_core/src/models/Album';
import type { Genre } from 'atolla_core/src/models/Genre';
import type { Playlist } from 'atolla_core/src/models/Playlist';
import type { Track } from 'atolla_core/src/models/Track';
import Strings from 'atolla_core/src/Strings';
import type { ImageCache } from 'atolla_core/src/services/ImageCache';
import { getLogger } from 'atolla_core/src/services/Logger';
import type { Transport } from 'atolla_core/src/transports/Transport';
import type { TrackSource } from 'atolla_player/src/services/TrackSource';
import type { PlaybackStore } from 'atolla_player/src/stores/Playback';
import { StatefulComponent } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';
import type { Label, Layout, ScrollView } from 'valdi_tsx/src/NativeTemplateElements';
import type { CardDetailItem } from '../../models/App';
import { type ConnectionMode, ConnectionModes } from '../../models/App';
import { createOnThisDayCardDetails } from '../../services/OnThisDay';
import type { OnThisDayService } from '../../services/OnThisDayService';
import type { RecentlyAddedService } from '../../services/RecentlyAddedService';
import type { ToastService } from '../../services/ToastService';
import {
	type PinnedItemEntry,
	type PinnedItemsStore,
	pinnedItemId,
} from '../../stores/PinnedItems';
import type { Preferences } from '../../stores/Preferences';
import { theme } from '../../theme';
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
	onOpenGenre?: (genre: Genre) => void;
	onOpenPlaylist?: (playlist: Playlist) => void;
	onThisDayService?: OnThisDayService;
	pinnedItemsStore?: PinnedItemsStore;
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
	pinnedItems: Array<PinnedItemEntry>;
	recentlyAddedAlbums: Array<Album>;
	revision: number;
}

export class HomeView extends StatefulComponent<HomeViewModel, HomeState> {
	private loadGeneration = 0;
	private cachedOnThisDayAlbumsRef: Array<Album> | null = null;
	private cachedOnThisDayCards: Array<CardDetailItem> = [];
	private cachedOnThisDayDayKey = '';
	private cachedRecentlyPlayedEntries: Array<TrackListEntry> = [];
	private cachedRecentlyPlayedTracksRef: Array<Track> | null = null;
	private cachedRecentlyAddedCards: Array<Card> = [];
	private cachedRecentlyAddedAlbumsRef: Array<Album> | null = null;
	private cachedRecentlyAddedGridColumns = -1;
	private cachedPinnedCards: Array<Card> = [];
	private cachedPinnedItemsRef: Array<PinnedItemEntry> | null = null;
	private subscribedPinnedItemsStore: PinnedItemsStore | undefined;
	private pendingCreatePlaylistTracks: TrackSource | null = null;
	private playlistFlow = new CancelableController(() => this.isDestroyed());
	private contextMenuAlbum: Album | null = null;
	private lastKnownGridColumns = -1;

	state: HomeState = {
		contextMenuCard: null,
		isRefreshing: false,
		onThisDayAlbums: [],
		pinnedItems: [],
		recentlyAddedAlbums: [],
		revision: 0,
	};

	onCreate(): void {
		this.lastKnownGridColumns = this.viewModel.preferences.gridColumns;
		this.registerDisposable(this.viewModel.preferences.subscribe(this.handlePreferencesChange));
		this.registerDisposable(this.playlistFlow.cancel);
		this.loadAlbums();
		this.subscribeToPinnedItemsStore();
	}

	onRender(): void {
		const onThisDayCards = this.createOnThisDayCards();
		const pinnedCards = this.createPinnedCards();
		const recentlyAddedCards = this.createRecentlyAddedCards();
		const recentlyPlayedTracks = this.createRecentlyPlayedEntries();

		log.debug('render', {
			onThisDay: onThisDayCards.length,
			pinned: pinnedCards.length,
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
								columnCount={this.viewModel.preferences.detailColumns}
								onCardLongPress={this.handleOnThisDayCardLongPress}
								onCardTap={this.handleAlbumCardTap}
							/>
						) : (
							<label style={styles.emptyState} value={Strings.homeNoAnniversaries()} />
						)}
					</layout>

					<layout style={styles.section}>
						<label style={styles.sectionTitle} value={Strings.homeSectionPinned()} />
						{pinnedCards.length > 0 ? (
							<CardGrid
								accessibilityId='home-pinned-grid'
								cards={pinnedCards}
								columnCount={this.viewModel.preferences.gridColumns}
								onCardLongPress={this.handlePinnedCardLongPress}
								onCardTap={this.handlePinnedCardTap}
							/>
						) : (
							<label style={styles.emptyState} value={Strings.homeNothingPinned()} />
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

					<MixesSection
						connectionMode={this.viewModel.connectionMode}
						gridColumns={this.viewModel.preferences.gridColumns}
						language={this.viewModel.preferences.language}
						playbackStore={this.viewModel.playbackStore}
						transport={this.viewModel.transport}
					/>

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
				</layout>
			</RefreshableScroll>
		</layout>;
	}

	onViewModelUpdate(prevViewModel?: HomeViewModel): void {
		if (!prevViewModel) {
			return;
		}

		this.subscribeToPinnedItemsStore();

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

	// the cards depend on today's date, so the day is part of the cache key: an app left open
	// across midnight must re-derive rather than keep yesterday's anniversaries
	private createOnThisDayCards(): Array<CardDetailItem> {
		const now = new Date();
		const dayKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;

		if (
			this.state.onThisDayAlbums === this.cachedOnThisDayAlbumsRef &&
			dayKey === this.cachedOnThisDayDayKey
		) {
			return this.cachedOnThisDayCards;
		}

		this.cachedOnThisDayAlbumsRef = this.state.onThisDayAlbums;
		this.cachedOnThisDayDayKey = dayKey;
		this.cachedOnThisDayCards = createOnThisDayCardDetails(this.state.onThisDayAlbums, now);
		return this.cachedOnThisDayCards;
	}

	private findHomeAlbum(id: string): Album | undefined {
		return (
			this.state.recentlyAddedAlbums.find((album) => album.id === id) ??
			this.state.onThisDayAlbums.find((album) => album.id === id)
		);
	}

	// pinned items are on-device only (no transport call), so this can hydrate straight from the
	// store; re-subscribes whenever the store instance itself changes, which covers both the login
	// race (activate() creates the store after this view has already mounted with it undefined) and
	// a later reconnect/re-login replacing the store with a new instance mid-session
	private subscribeToPinnedItemsStore(): void {
		const store = this.viewModel.pinnedItemsStore;
		if (!store || store === this.subscribedPinnedItemsStore) {
			return;
		}
		this.subscribedPinnedItemsStore = store;
		this.registerDisposable(store.subscribe(this.handlePinnedItemsChange));
		this.loadPinnedItems();
	}

	private handlePinnedItemsChange = (): void => {
		this.loadPinnedItems();
	};

	private loadPinnedItems(): void {
		this.setState({ pinnedItems: this.viewModel.pinnedItemsStore?.getAll() ?? [] });
	}

	private createPinnedCards(): Array<Card> {
		if (this.state.pinnedItems === this.cachedPinnedItemsRef) {
			return this.cachedPinnedCards;
		}

		this.cachedPinnedItemsRef = this.state.pinnedItems;
		this.cachedPinnedCards = this.state.pinnedItems.map(pinnedEntryToCard);
		return this.cachedPinnedCards;
	}

	private findPinnedEntry(kind: PinnedItemEntry['kind'], id: string): PinnedItemEntry | undefined {
		return this.state.pinnedItems.find(
			(entry) => entry.kind === kind && pinnedItemId(entry) === id,
		);
	}

	private navigateToCard(card: CardContextMenuCard): void {
		if (card.kind === 'album') {
			this.viewModel.onOpenAlbum(card.album);
		} else if (card.kind === 'artist') {
			this.viewModel.onNavigateToArtist?.(card.artist.id);
		} else if (card.kind === 'genre') {
			this.viewModel.onOpenGenre?.(card.genre);
		} else {
			this.viewModel.onOpenPlaylist?.(card.playlist);
		}
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
		const { recentlyPlayedTracks } = this.viewModel;
		if (recentlyPlayedTracks !== this.cachedRecentlyPlayedTracksRef) {
			this.cachedRecentlyPlayedTracksRef = recentlyPlayedTracks;
			this.cachedRecentlyPlayedEntries = recentlyPlayedTracks.slice(0, 5).map((track, index) => ({
				artworkSource: track.albumImageUrl ?? null,
				id: track.id,
				leadingLabel: String(index + 1),
				meta: track.artistName ?? track.albumName ?? '',
				title: track.name,
				track,
			}));
		}

		return this.cachedRecentlyPlayedEntries;
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
		const { modalSlot, playbackStore, toastService, transport } = this.viewModel;
		const { animationsEnabled } = this.viewModel.preferences;
		openCardContextMenu(modalSlot, {
			animationsEnabled,
			card: { album, kind: 'album' },
			isPinned: this.viewModel.pinnedItemsStore?.isPinned('album', album.id) ?? false,
			onAddToPlaylist: this.handleAlbumContextMenuAddToPlaylist,
			onArtistTap: album.artistId ? this.handleAlbumContextMenuArtistTap : undefined,
			onCreatePlaylist: this.handleAlbumContextMenuCreatePlaylist,
			onDismiss: this.handleContextMenuDismiss,
			onEntityTap: this.handleAlbumContextMenuEntityTap,
			onPin: () => {
				void this.viewModel.pinnedItemsStore?.pin({ album, kind: 'album' });
			},
			onUnpin: () => {
				void this.viewModel.pinnedItemsStore?.unpin('album', album.id);
			},
			playbackStore,
			toastService,
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

	private handlePinnedCardTap = (card: {
		id: string;
		kind: 'album' | 'artist' | 'genre' | 'playlist';
	}): void => {
		const entry = this.findPinnedEntry(card.kind, card.id);
		if (!entry) return;
		this.navigateToCard(entry);
	};

	private handlePinnedCardLongPress = (card: {
		id: string;
		kind: 'album' | 'artist' | 'genre' | 'playlist';
	}): void => {
		const entry = this.findPinnedEntry(card.kind, card.id);
		if (!entry) return;
		hapticFeedback();

		this.setState({ contextMenuCard: entry });
		this.openPinnedCardContextMenu(entry);
	};

	private openPinnedCardContextMenu(card: CardContextMenuCard): void {
		const { modalSlot, playbackStore, toastService, transport } = this.viewModel;
		const { animationsEnabled } = this.viewModel.preferences;
		const id = pinnedItemId(card);
		openCardContextMenu(modalSlot, {
			animationsEnabled,
			card,
			isPinned: true,
			onAddToPlaylist: this.handleAlbumContextMenuAddToPlaylist,
			onArtistTap:
				card.kind === 'album' || card.kind === 'artist'
					? this.handlePinnedContextMenuArtistTap
					: undefined,
			onCreatePlaylist: this.handleAlbumContextMenuCreatePlaylist,
			onDismiss: this.handleContextMenuDismiss,
			onEntityTap: this.handlePinnedContextMenuEntityTap,
			onPin: () => {
				void this.viewModel.pinnedItemsStore?.pin(card);
			},
			onUnpin: () => {
				void this.viewModel.pinnedItemsStore?.unpin(card.kind, id);
			},
			playbackStore,
			toastService,
			transport,
		});
	}

	private handlePinnedContextMenuArtistTap = (): void => {
		const card = this.state.contextMenuCard;
		this.handleContextMenuDismiss();
		if (card?.kind === 'artist') {
			this.viewModel.onNavigateToArtist?.(card.artist.id);
		} else if (card?.kind === 'album') {
			this.viewModel.onNavigateToArtist?.(card.album.artistId);
		}
	};

	private handlePinnedContextMenuEntityTap = (): void => {
		const card = this.state.contextMenuCard;
		if (!card) return;
		this.handleContextMenuDismiss();
		this.navigateToCard(card);
	};
}

function pinnedEntryToCard(entry: PinnedItemEntry): Card {
	switch (entry.kind) {
		case 'album':
			return {
				artworkKey: entry.album.imageUrl ?? '',
				id: entry.album.id,
				kind: 'album',
				primaryText: entry.album.name,
				secondaryText: entry.album.artistName,
			};
		case 'artist':
			return {
				artworkKey: entry.artist.imageUrl ?? '',
				id: entry.artist.id,
				kind: 'artist',
				primaryText: entry.artist.name,
				secondaryText: '',
			};
		case 'genre':
			return {
				artworkKey: entry.genre.imageUrl ?? '',
				id: entry.genre.id,
				kind: 'genre',
				primaryText: entry.genre.name,
				secondaryText: '',
			};
		case 'playlist':
			return {
				artworkKey: entry.playlist.imageUrl ?? '',
				id: entry.playlist.id,
				kind: 'playlist',
				primaryText: entry.playlist.name,
				secondaryText: '',
			};
	}
}

const styles = {
	content: new Style<Layout>({
		paddingBottom: theme.scale(18),
		paddingLeft: theme.scale(14),
		paddingRight: theme.scale(14),
		paddingTop: theme.headerHeight + theme.padding.deviceInset + 8,
		width: '100%',
	}),
	emptyState: new Style<Label>({
		...theme.text.sub,
		marginTop: theme.scale(6),
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
		marginBottom: theme.scale(24),
		width: '100%',
	}),
	sectionTitle: new Style<Label>({
		...theme.text.mainBold,
		marginBottom: theme.scale(8),
	}),
};
