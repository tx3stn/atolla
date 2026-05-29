import res from 'atolla/res';
import { StatefulComponent } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';
import type { Label, ScrollView } from 'valdi_tsx/src/NativeTemplateElements';
import type { Album } from '../../models/Album';
import type { Playlist } from '../../models/Playlist';
import type { Track } from '../../models/Track';
import Strings from '../../Strings';
import { DebugLogger } from '../../services/DebugLogger';
import type { ImageCache } from '../../services/ImageCache';
import { createOnThisDayCardDetails } from '../../services/OnThisDay';
import type { OnThisDayService } from '../../services/OnThisDayService';
import { SHUFFLE_PAGE_SIZE, ShuffleQueueLoader } from '../../services/ShuffleQueueLoader';
import type { PlaybackStore } from '../../stores/Playback';
import { scrollPaddingBottom, theme, topInset } from '../../theme';
import { type ConnectionMode, ConnectionModes } from '../../transports/Model';
import type { Transport } from '../../transports/Transport';
import type { CardContextMenuCard } from '../components/CardContextMenu';
import type { CardDetailItem } from '../components/CardDetailList';
import { CardDetailList } from '../components/CardDetailList';
import { type Card, CardGrid } from '../components/CardGrid';
import { CreatePlaylistModal } from '../components/CreatePlaylistModal';
import { TrackList, type TrackListEntry } from '../components/TrackList';
import { ViewHeader } from '../components/ViewHeader';
import { openCardContextMenu } from '../flows/cardContextMenuFlow';
import { closeSlot, openSlot } from '../flows/modalSlotFlow';
import { createPlaylistAndAddTracks } from '../flows/playlistFlow';
import { openTrackContextMenu } from '../flows/trackContextMenuController';
import { hapticFeedback } from '../haptics';
import { AddToPlaylistView } from './AddToPlaylistView';
import { parseHomeAlbumsCache, serializeHomeAlbumsCache } from './HomeAlbumsCache';
import {
	buildShuffleLibraryQueue,
	getRandomAlbumTracks,
	isSameTrackQueue,
	resolveArtistLogoUrlsForTracks,
	shouldApplyTransportAlbumsToHome,
} from './HomeViewLogic';

export interface HomeViewModel {
	animationsEnabled: boolean;
	connectionMode: ConnectionMode;
	gridColumns: number;
	homeAlbumsStore?: HomeAlbumsPersistence;
	imageCache: ImageCache;
	modalSlot?: DetachedSlot;
	onNavigateToArtist?: (artistId: string) => void;
	onOpenAlbum: (album: Album) => void;
	onOpenPlaylist?: (playlist: Playlist) => void;
	onRequestModeChange: (mode: ConnectionMode) => Promise<boolean>;
	onThisDayService?: OnThisDayService;
	playbackStore: PlaybackStore;
	recentlyPlayedTracks: Array<Track>;
	transport: Transport;
}

export interface HomeAlbumsPersistence {
	fetchString(key: string): Promise<string>;
	storeString(key: string, value: string): Promise<void>;
}

interface HomeState {
	contextMenuCard: CardContextMenuCard | null;
	onThisDayAlbums: Array<Album>;
	recentlyAddedAlbums: Array<Album>;
}

const RECENTLY_ADDED_ALBUMS_CACHE_KEY = 'recently_added_v1';
const SHUFFLE_LIBRARY_MIX_ID = 'mix-shuffle-library';
const RANDOM_ALBUM_MIX_ID = 'mix-random-album';

export class HomeView extends StatefulComponent<HomeViewModel, HomeState> {
	private hasBeenDestroyed = false;
	private loadGeneration = 0;
	private shuffleLoader: ShuffleQueueLoader | null = null;
	private shuffleLoadToken = 0;
	private cachedRecentlyAddedCards: Array<Card> = [];
	private cachedRecentlyAddedAlbumsRef: Array<Album> | null = null;
	private cachedRecentlyAddedGridColumns = -1;
	private pendingCreatePlaylistTracks: Array<Track> | null = null;
	private contextMenuAlbum: Album | null = null;
	state: HomeState = {
		contextMenuCard: null,
		onThisDayAlbums: [],
		recentlyAddedAlbums: [],
	};

	onCreate(): void {
		this.hasBeenDestroyed = false;
		this.loadAlbums();
	}

	onDestroy(): void {
		this.hasBeenDestroyed = true;
		this.shuffleLoader?.dispose();
	}

	onViewModelUpdate(prevViewModel?: HomeViewModel): void {
		if (!prevViewModel) {
			return;
		}

		if (
			this.viewModel.transport !== prevViewModel.transport ||
			this.viewModel.connectionMode !== prevViewModel.connectionMode
		) {
			DebugLogger.log('home', 'transport/mode changed, reloading', {
				connectionMode: this.viewModel.connectionMode,
				onThisDay: this.state.onThisDayAlbums.length,
			});
			this.loadAlbums();
		} else if (this.viewModel.gridColumns !== prevViewModel.gridColumns) {
			this.loadRecentlyAdded(this.loadGeneration);
		}
	}

	private loadAlbums(): void {
		const generation = this.loadGeneration + 1;
		this.loadGeneration = generation;
		this.loadOnThisDay(generation);
		this.restoreCachedRecentlyAdded(generation);

		if (shouldApplyTransportAlbumsToHome(this.viewModel.connectionMode)) {
			this.loadRecentlyAdded(generation);
		}
	}

	// Shows the cached anniversary albums immediately, then (online) rebuilds them
	// in the background via OnThisDayService and re-renders from its own state — so
	// display never depends on a parent re-render arriving at the right moment.
	private loadOnThisDay(generation: number): void {
		const service = this.viewModel.onThisDayService;
		if (!service) {
			return;
		}

		void service
			.ensureLoaded()
			.then(() => {
				if (this.hasBeenDestroyed || generation !== this.loadGeneration) {
					return;
				}
				const cached = service.getAlbumsForDate(new Date());
				DebugLogger.log('home', 'on-this-day from cache', { count: cached.length });
				this.setState({ onThisDayAlbums: cached });

				if (!shouldApplyTransportAlbumsToHome(this.viewModel.connectionMode)) {
					return undefined;
				}

				return service.refresh(this.viewModel.transport, new Date()).then((summary) => {
					if (this.hasBeenDestroyed || generation !== this.loadGeneration) {
						return;
					}
					DebugLogger.log('home', 'on-this-day refreshed', summary);
					this.setState({ onThisDayAlbums: service.getAlbumsForDate(new Date()) });
				});
			})
			.catch(() => {});
	}

	private restoreCachedRecentlyAdded(generation: number): void {
		const store = this.viewModel.homeAlbumsStore;
		if (!store) {
			return;
		}

		store
			.fetchString(RECENTLY_ADDED_ALBUMS_CACHE_KEY)
			.then((raw) => {
				if (this.hasBeenDestroyed || generation !== this.loadGeneration) {
					return;
				}

				const cachedAlbums = parseHomeAlbumsCache(raw);
				if (cachedAlbums == null || cachedAlbums.length === 0) {
					return;
				}

				if (this.state.recentlyAddedAlbums.length === 0) {
					this.setState({ recentlyAddedAlbums: cachedAlbums });
				}
			})
			.catch(() => {});
	}

	private loadRecentlyAdded(generation: number): void {
		const limit = Math.max(1, this.viewModel.gridColumns) * 2;
		void this.viewModel.transport
			.getRecentlyAddedAlbums?.(limit)
			.then((albums) => {
				if (this.hasBeenDestroyed || generation !== this.loadGeneration) {
					return;
				}
				this.setState({ recentlyAddedAlbums: albums });
				this.persistRecentlyAdded(albums);
			})
			.catch(() => {});
	}

	private persistRecentlyAdded(albums: Array<Album>): void {
		const store = this.viewModel.homeAlbumsStore;
		if (!store) {
			return;
		}

		void store
			.storeString(RECENTLY_ADDED_ALBUMS_CACHE_KEY, serializeHomeAlbumsCache(albums))
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
		const { gridColumns } = this.viewModel;
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

		void resolveArtistLogoUrlsForTracks(queue, this.viewModel.transport).then((logoUrls) => {
			if (!isSameTrackQueue(this.viewModel.playbackStore.tracks, queue)) {
				return;
			}

			this.viewModel.playbackStore.setArtistLogoUrls(logoUrls);
		});
	};

	private handleRecentlyPlayedTrackLongPress = (track: Track): void => {
		const { animationsEnabled, gridColumns, imageCache, playbackStore, transport } = this.viewModel;
		const { albumId, artistId } = track;
		openTrackContextMenu(track, this.viewModel.modalSlot, {
			animationsEnabled,
			gridColumns,
			imageCache,
			onAlbumTap: albumId
				? () =>
						this.viewModel.onOpenAlbum({
							artistId: track.artistId ?? '',
							artistName: track.artistName ?? '',
							id: albumId,
							imageUrl: track.albumImageUrl,
							name: track.albumName ?? '',
						})
				: undefined,
			onArtistTap:
				this.viewModel.onNavigateToArtist && artistId
					? () => this.viewModel.onNavigateToArtist?.(artistId)
					: undefined,
			onDismiss: () => {
				this.contextMenuAlbum = null;
				this.setState({ contextMenuCard: null });
			},
			onPlaylistCreated: (playlist) => {
				this.viewModel.onOpenPlaylist?.(playlist);
			},
			playbackStore,
			transport,
		});
	};

	private closeModalSlot = (): void => {
		closeSlot(this.viewModel.modalSlot);
	};

	private handleContextMenuDismiss = (): void => {
		this.closeModalSlot();
		this.contextMenuAlbum = null;
		this.setState({ contextMenuCard: null });
	};

	private handleAlbumContextMenuAddToPlaylist = (tracks: Array<Track>): void => {
		this.setState({ contextMenuCard: null });
		openSlot(this.viewModel.modalSlot, () => {
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

	private handleAlbumContextMenuArtistTap = (): void => {
		const album = this.contextMenuAlbum;
		if (!album?.artistId) return;
		this.handleContextMenuDismiss();
		this.viewModel.onNavigateToArtist?.(album.artistId);
	};

	private handleAlbumContextMenuCreatePlaylist = (tracks: Array<Track>): void => {
		this.pendingCreatePlaylistTracks = tracks;
		this.setState({ contextMenuCard: null });
		openSlot(this.viewModel.modalSlot, () => {
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
		this.viewModel.onOpenPlaylist?.(playlist);
	};

	private handleAlbumContextMenuEntityTap = (): void => {
		const album = this.contextMenuAlbum;
		if (!album) return;
		this.handleContextMenuDismiss();
		this.viewModel.onOpenAlbum(album);
	};

	private openAlbumCardContextMenu(album: Album): void {
		const { animationsEnabled, imageCache, modalSlot, playbackStore, transport } = this.viewModel;
		openCardContextMenu(modalSlot, {
			animationsEnabled,
			card: { album, kind: 'album' },
			imageCache,
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

	private createMixCards(): Array<Card> {
		return [
			{
				artworkKey: '',
				icon: res.shufflelibrary,
				id: SHUFFLE_LIBRARY_MIX_ID,
				kind: 'playlist',
				primaryText: Strings.shuffleLibrary(),
				secondaryText: '',
			},
			{
				artworkKey: '',
				icon: res.randomalbum,
				id: RANDOM_ALBUM_MIX_ID,
				kind: 'playlist',
				primaryText: Strings.randomAlbum(),
				secondaryText: '',
			},
		];
	}

	private handleMixCardTap = (card: {
		id: string;
		kind: 'album' | 'artist' | 'genre' | 'playlist';
	}): void => {
		hapticFeedback();

		if (card.id === SHUFFLE_LIBRARY_MIX_ID) {
			void this.startShuffleLibraryMix();
		} else if (card.id === RANDOM_ALBUM_MIX_ID) {
			void this.startRandomAlbumMix();
		}
	};

	private async startShuffleLibraryMix(): Promise<void> {
		this.shuffleLoader?.dispose();
		this.shuffleLoader = null;
		const token = ++this.shuffleLoadToken;

		const { connectionMode, playbackStore, transport } = this.viewModel;

		if (connectionMode === ConnectionModes.online && transport.getShuffledLibraryTracksPage) {
			const getPage = transport.getShuffledLibraryTracksPage;
			const fetchPage = (page: number, pageSize: number) => getPage.call(transport, page, pageSize);

			let result: { hasMore: boolean; items: Array<Track> };
			try {
				result = await fetchPage(1, SHUFFLE_PAGE_SIZE);
			} catch {
				return;
			}

			if (this.hasBeenDestroyed || token !== this.shuffleLoadToken) {
				return;
			}
			if (result.items.length === 0) {
				return;
			}

			playbackStore.playTracks(result.items, 0);

			if (result.hasMore) {
				const loader = new ShuffleQueueLoader(playbackStore, fetchPage, SHUFFLE_PAGE_SIZE);
				loader.start(2, true);
				this.shuffleLoader = loader;
			}

			const initialItems = result.items;
			void resolveArtistLogoUrlsForTracks(initialItems, transport).then((logoUrls) => {
				if (playbackStore.tracks[0]?.id !== initialItems[0]?.id) {
					return;
				}
				playbackStore.setArtistLogoUrls(logoUrls);
			});
			return;
		}

		const queue = await buildShuffleLibraryQueue(connectionMode, transport);

		if (this.hasBeenDestroyed || token !== this.shuffleLoadToken) {
			return;
		}
		if (queue.length === 0) {
			return;
		}

		playbackStore.playTracks(queue, 0);

		void resolveArtistLogoUrlsForTracks(queue, transport).then((logoUrls) => {
			if (!isSameTrackQueue(playbackStore.tracks, queue)) {
				return;
			}
			playbackStore.setArtistLogoUrls(logoUrls);
		});
	}

	private async startRandomAlbumMix(): Promise<void> {
		const { playbackStore, transport } = this.viewModel;

		let tracks: Array<Track>;
		try {
			tracks = await getRandomAlbumTracks(transport);
		} catch {
			return;
		}

		if (this.hasBeenDestroyed) {
			return;
		}
		if (tracks.length === 0) {
			return;
		}

		playbackStore.playTracks(tracks, 0);

		void resolveArtistLogoUrlsForTracks(tracks, transport).then((logoUrls) => {
			if (!isSameTrackQueue(playbackStore.tracks, tracks)) {
				return;
			}
			playbackStore.setArtistLogoUrls(logoUrls);
		});
	}

	onRender(): void {
		const onThisDayCards = this.createOnThisDayCards();
		const mixCards = this.createMixCards();
		const recentlyAddedCards = this.createRecentlyAddedCards();
		const recentlyPlayedTracks = this.createRecentlyPlayedEntries();

		// Last breadcrumb before the native card lists render — pinpoints a
		// render-thread crash on the offline->online toggle.
		DebugLogger.log('home', 'render', {
			onThisDay: onThisDayCards.length,
			recentlyAdded: recentlyAddedCards.length,
			recentlyPlayed: recentlyPlayedTracks.length,
		});

		<layout accessibilityLabel='home-view' style={styles.root}>
			<ViewHeader
				animationsEnabled={this.viewModel.animationsEnabled}
				connectionMode={this.viewModel.connectionMode}
				onRequestModeChange={this.viewModel.onRequestModeChange}
				title={Strings.homeTitle()}
			/>

			<scroll style={createScrollStyle(this.viewModel.playbackStore.track !== null)}>
				<layout style={styles.content}>
					<layout style={styles.sections}>
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
								columnCount={this.viewModel.gridColumns}
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

						<layout style={styles.section}>
							<label style={styles.sectionTitle} value={Strings.homeSectionMixes()} />
							<CardGrid
								accessibilityId='home-mixes-grid'
								cards={mixCards}
								columnCount={this.viewModel.gridColumns}
								onCardTap={this.handleMixCardTap}
							/>
						</layout>
					</layout>
				</layout>
			</scroll>
		</layout>;
	}
}

function createScrollStyle(isFooterVisible: boolean): Style<ScrollView> {
	return isFooterVisible ? scrollStyles.withFooter : scrollStyles.withoutFooter;
}

const scrollStyles = {
	withFooter: new Style<ScrollView>({
		backgroundColor: theme.colors.bg,
		flexGrow: 1,
		paddingBottom: scrollPaddingBottom(true),
		width: '100%',
	}),
	withoutFooter: new Style<ScrollView>({
		backgroundColor: theme.colors.bg,
		flexGrow: 1,
		paddingBottom: scrollPaddingBottom(false),
		width: '100%',
	}),
};

const styles = {
	content: new Style({
		paddingBottom: 18,
		paddingLeft: 14,
		paddingRight: 14,
		paddingTop: theme.headerHeight + topInset + 8,
		width: '100%',
	}),
	emptyState: new Style<Label>({
		...theme.text.sub,
		marginTop: 6,
	}),
	root: new Style({
		flexGrow: 1,
		width: '100%',
	}),
	section: new Style({
		marginBottom: 24,
		width: '100%',
	}),
	sections: new Style({
		width: '100%',
	}),
	sectionTitle: new Style<Label>({
		...theme.text.mainBold,
		marginBottom: 8,
	}),
};
