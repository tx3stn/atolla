import { StatefulComponent } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';
import type { Label, ScrollView } from 'valdi_tsx/src/NativeTemplateElements';
import type { Album } from '../../models/Album';
import type { CardDetailItem } from '../../models/CardDetailItem';
import type { Playlist } from '../../models/Playlist';
import type { Track } from '../../models/Track';
import Strings from '../../Strings';
import { DebugLogger } from '../../services/DebugLogger';
import type { ImageCache } from '../../services/ImageCache';
import { createOnThisDayCardDetails } from '../../services/OnThisDay';
import type { OnThisDayService } from '../../services/OnThisDayService';
import type { RecentlyAddedService } from '../../services/RecentlyAddedService';
import type { ToastService } from '../../services/ToastService';
import type { PlaybackStore } from '../../stores/Playback';
import { theme } from '../../theme';
import { type ConnectionMode, ConnectionModes } from '../../transports/Model';
import type { Transport } from '../../transports/Transport';
import { hapticFeedback } from '../../utils/Haptics';
import type { CardContextMenuCard } from '../components/CardContextMenu';
import { CardDetailList } from '../components/CardDetailList';
import { type Card, CardGrid } from '../components/CardGrid';
import { CreatePlaylistModal } from '../components/CreatePlaylistModal';
import { MixesSection } from '../components/MixesSection';
import { TrackList, type TrackListEntry } from '../components/TrackList';
import { ViewHeader } from '../components/ViewHeader';
import { openCardContextMenu } from '../flows/CardContextMenu';
import { createPlaylistAndAddTracks } from '../flows/CreatePlaylist';
import { closeSlot, openSlot } from '../flows/ModalSlotFlow';
import { openTrackContextMenu } from '../flows/TrackContextMenu';
import { AddToPlaylistView } from './AddToPlaylistView';

export interface HomeViewModel {
	animationsEnabled: boolean;
	connectionMode: ConnectionMode;
	gridColumns: number;
	imageCache: ImageCache;
	modalSlot?: DetachedSlot;
	onNavigateToArtist?: (artistId: string) => void;
	onOpenAlbum: (album: Album) => void;
	onOpenPlaylist?: (playlist: Playlist) => void;
	onRequestModeChange: (mode: ConnectionMode) => Promise<boolean>;
	onThisDayService?: OnThisDayService;
	playbackStore: PlaybackStore;
	recentlyAddedService?: RecentlyAddedService;
	recentlyPlayedTracks: Array<Track>;
	toastService: ToastService;
	transport: Transport;
}

interface HomeState {
	contextMenuCard: CardContextMenuCard | null;
	onThisDayAlbums: Array<Album>;
	recentlyAddedAlbums: Array<Album>;
}

export class HomeView extends StatefulComponent<HomeViewModel, HomeState> {
	private loadGeneration = 0;
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
		this.loadAlbums();
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

		// offline only has downloaded albums, so keep the last full-library snapshot rather than overwrite home with the downloads subset
		if (this.viewModel.connectionMode !== ConnectionModes.offline) {
			this.loadRecentlyAdded(generation);
		}
	}

	// shows cached anniversary albums immediately, then (online) rebuilds in the background via OnThisDayService and re-renders from its own state, so display never depends on a parent re-render arriving at the right moment
	private loadOnThisDay(generation: number): void {
		const service = this.viewModel.onThisDayService;
		if (!service) {
			return;
		}

		void service
			.ensureLoaded()
			.then(() => {
				if (this.isDestroyed() || generation !== this.loadGeneration) {
					return;
				}
				const cached = service.getAlbumsForDate(new Date());
				DebugLogger.log('home', 'on-this-day from cache', { count: cached.length });
				this.setState({ onThisDayAlbums: cached });

				// offline only has downloaded albums, so keep the cached snapshot
				if (this.viewModel.connectionMode === ConnectionModes.offline) {
					return undefined;
				}

				return service.refresh(this.viewModel.transport, new Date()).then((summary) => {
					if (this.isDestroyed() || generation !== this.loadGeneration) {
						return;
					}
					DebugLogger.log('home', 'on-this-day refreshed', summary);
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

	private loadRecentlyAdded(generation: number): void {
		const service = this.viewModel.recentlyAddedService;
		if (!service) {
			return;
		}

		const limit = Math.max(1, this.viewModel.gridColumns) * 2;
		void service
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
	};

	private handleRecentlyPlayedTrackLongPress = (track: Track): void => {
		const { animationsEnabled, gridColumns, imageCache, playbackStore, toastService, transport } =
			this.viewModel;
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
			toastService,
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
		this.viewModel.onOpenPlaylist?.(playlist);
	};

	private handleAlbumContextMenuEntityTap = (): void => {
		const album = this.contextMenuAlbum;
		if (!album) return;
		this.handleContextMenuDismiss();
		this.viewModel.onOpenAlbum(album);
	};

	private openAlbumCardContextMenu(album: Album): void {
		const { animationsEnabled, modalSlot, playbackStore, transport } = this.viewModel;
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

	onRender(): void {
		const onThisDayCards = this.createOnThisDayCards();
		const recentlyAddedCards = this.createRecentlyAddedCards();
		const recentlyPlayedTracks = this.createRecentlyPlayedEntries();

		// last breadcrumb before the native card lists render: pinpoints a render-thread crash on the offline->online toggle
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

			<scroll style={styles.scroll}>
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

						<MixesSection
							connectionMode={this.viewModel.connectionMode}
							gridColumns={this.viewModel.gridColumns}
							playbackStore={this.viewModel.playbackStore}
							transport={this.viewModel.transport}
						/>
					</layout>
				</layout>
			</scroll>
		</layout>;
	}
}

const styles = {
	content: new Style({
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
	root: new Style({
		flexGrow: 1,
		width: '100%',
	}),
	scroll: new Style<ScrollView>({
		backgroundColor: theme.colors.bg,
		flexGrow: 1,
		paddingBottom: theme.padding.scrollBottom,
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
