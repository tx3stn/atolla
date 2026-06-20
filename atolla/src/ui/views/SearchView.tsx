import res from 'atolla/res';
import { StatefulComponent } from 'valdi_core/src/Component';
import { ElementRef } from 'valdi_core/src/ElementRef';
import { Style } from 'valdi_core/src/Style';
import type { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';
import type { NavigationController } from 'valdi_navigation/src/NavigationController';
import type {
	ImageView,
	Label,
	Layout,
	ScrollView,
	View,
} from 'valdi_tsx/src/NativeTemplateElements';
import type { Album } from '../../models/Album';
import type { Artist } from '../../models/Artist';
import type { Playlist } from '../../models/Playlist';
import type { SearchResults } from '../../models/Search';
import type { Track } from '../../models/Track';
import Strings from '../../Strings';
import type { DownloadService } from '../../services/DownloadService';
import type { ImageCache } from '../../services/ImageCache';
import type { PaletteGenerationQueue } from '../../services/PaletteGenerationQueue';
import type { PlaylistEditService } from '../../services/PlaylistEditService';
import type { ToastService } from '../../services/ToastService';
import type { PlaybackStore } from '../../stores/Playback';
import type { SearchStore } from '../../stores/Search';
import { theme } from '../../theme';
import type { Transport } from '../../transports/Transport';
import type { CardContextMenuCard } from '../components/CardContextMenu';
import { type Card, CardGrid } from '../components/CardGrid';
import { CreatePlaylistModal } from '../components/CreatePlaylistModal';
import { LoopingArrowSpinner } from '../components/LoopingArrowSpinner';
import { TrackList, type TrackListEntry } from '../components/TrackList';
import { openCardContextMenu } from '../flows/CardContextMenu';
import { createPlaylistAndAddTracks } from '../flows/CreatePlaylist';
import { closeSlot, openSlot } from '../flows/ModalSlotFlow';
import { openTrackContextMenu } from '../flows/TrackContextMenu';
import type { NavBarContext } from '../NavBarContext';
import { AddToPlaylistView } from './AddToPlaylistView';
import { AlbumView } from './AlbumView';
import { ArtistView } from './ArtistView';
import { PlaylistView } from './PlaylistView';

type SearchStatus = 'idle' | 'loading' | 'success' | 'empty' | 'error';

export interface SearchViewModel {
	animationsEnabled: boolean;
	downloadService: DownloadService;
	focusSignal?: number;
	gridColumns: number;
	imageCache: ImageCache;
	modalSlot?: DetachedSlot;
	navBarContext?: NavBarContext;
	navigationController: NavigationController;
	onNavigateToLibraryResult?: (target: SearchLibraryNavigationTarget) => void;
	paletteQueue?: PaletteGenerationQueue;
	playbackStore: PlaybackStore;
	playlistEditService: PlaylistEditService;
	searchStore: SearchStore;
	toastService: ToastService;
	transport: Transport;
}

export type SearchLibraryNavigationTarget =
	| { album: Album; kind: 'album' }
	| { artist: Artist; kind: 'artist' }
	| { kind: 'playlist'; playlist: Playlist };

interface SearchState {
	contextMenuCard: CardContextMenuCard | null;
	errorMessage: string | null;
	lastSubmittedQuery: string;
	query: string;
	recentSearches: Array<string>;
	results: SearchResults;
	status: SearchStatus;
}

function normalizeSearchInput(value: unknown): string {
	if (typeof value === 'string') {
		return value;
	}

	if (typeof value === 'number') {
		return String(value);
	}

	if (value && typeof value === 'object') {
		const candidate = value as {
			nativeEvent?: { text?: unknown; value?: unknown };
			query?: unknown;
			text?: unknown;
			value?: unknown;
		};

		const direct = candidate.text ?? candidate.value ?? candidate.query;
		if (typeof direct === 'string') {
			return direct;
		}

		const native = candidate.nativeEvent?.text ?? candidate.nativeEvent?.value;
		if (typeof native === 'string') {
			return native;
		}
	}

	return '';
}

export class SearchView extends StatefulComponent<SearchViewModel, SearchState> {
	private cardContextMenuCard: CardContextMenuCard | null = null;
	private pendingCreatePlaylistTracks: Array<Track> | null = null;
	private requestVersion = 0;
	private recentSearchTapHandlers = new Map<string, () => void>();
	private searchInputRef = new ElementRef();

	state: SearchState = {
		contextMenuCard: null,
		errorMessage: null,
		lastSubmittedQuery: '',
		query: '',
		recentSearches: [],
		results: {
			albums: [],
			artists: [],
			playlists: [],
			tracks: [],
		},
		status: 'idle',
	};

	onCreate(): void {
		this.focusSearchInput();

		this.viewModel.searchStore.getRecentSearches().then((recentSearches) => {
			if (this.isDestroyed()) {
				return;
			}
			this.setState({ recentSearches });
		});
	}

	onViewModelUpdate(prevViewModel?: SearchViewModel): void {
		if (!prevViewModel) {
			return;
		}

		const nextFocusSignal = this.viewModel.focusSignal ?? 0;
		const prevFocusSignal = prevViewModel.focusSignal ?? 0;
		if (nextFocusSignal === prevFocusSignal) {
			return;
		}

		this.focusSearchInput();
	}

	private focusSearchInput(): void {
		Promise.resolve().then(() => {
			if (this.isDestroyed()) {
				return;
			}
			this.searchInputRef.setAttribute('focused', true);
			this.searchInputRef.setAttribute('selection', [
				this.state.query.length,
				this.state.query.length,
			]);
			setTimeout(() => {
				if (this.isDestroyed()) {
					return;
				}
				this.searchInputRef.setAttribute('focused', true);
				this.searchInputRef.setAttribute('selection', [
					this.state.query.length,
					this.state.query.length,
				]);
			}, 32);
		});
	}

	private blurSearchInput(): void {
		this.searchInputRef.setAttribute('focused', false);
	}

	handleSubmitSearch = (query: unknown): void => {
		const trimmedQuery = normalizeSearchInput(query).trim();
		if (!trimmedQuery) {
			this.requestVersion += 1;
			this.setState({
				errorMessage: null,
				lastSubmittedQuery: '',
				results: {
					albums: [],
					artists: [],
					playlists: [],
					tracks: [],
				},
				status: 'idle',
			});
			return;
		}

		this.requestVersion += 1;
		const currentRequestVersion = this.requestVersion;
		this.setState({
			errorMessage: null,
			lastSubmittedQuery: trimmedQuery,
			query: trimmedQuery,
			results: {
				albums: [],
				artists: [],
				playlists: [],
				tracks: [],
			},
			status: 'loading',
		});

		this.viewModel.searchStore.addRecentSearch(trimmedQuery).then((recentSearches) => {
			if (this.isDestroyed() || currentRequestVersion !== this.requestVersion) {
				return;
			}

			this.setState({ recentSearches });
		});

		this.viewModel.transport
			.search(trimmedQuery)
			.then((results) => {
				if (this.isDestroyed() || currentRequestVersion !== this.requestVersion) {
					return;
				}

				const hasResults =
					results.tracks.length > 0 ||
					results.albums.length > 0 ||
					results.artists.length > 0 ||
					results.playlists.length > 0;

				this.setState({
					results,
					status: hasResults ? 'success' : 'empty',
				});
			})
			.catch((error) => {
				if (this.isDestroyed() || currentRequestVersion !== this.requestVersion) {
					return;
				}

				this.setState({
					errorMessage: error instanceof Error ? error.message : 'Could not search right now.',
					results: {
						albums: [],
						artists: [],
						playlists: [],
						tracks: [],
					},
					status: 'error',
				});
			});
	};

	handleTrackLongPress = (track: Track): void => {
		const {
			animationsEnabled,
			downloadService,
			gridColumns,
			imageCache,
			paletteQueue,
			playbackStore,
			transport,
		} = this.viewModel;
		const modalSlot = this.viewModel.navBarContext?.modalSlot ?? this.viewModel.modalSlot;
		openTrackContextMenu(track, modalSlot, {
			animationsEnabled,
			gridColumns,
			imageCache,
			onAlbumTap: undefined,
			onArtistTap: track.artistId ? () => this.handleContextMenuArtistTap(track) : undefined,
			onDismiss: () => {},
			onPlaylistCreated: (playlist) => {
				this.viewModel.navigationController.push(
					PlaylistView,
					{
						animationsEnabled,
						downloadService,
						gridColumns,
						imageCache,
						navBarContext: this.viewModel.navBarContext,
						paletteQueue,
						playbackStore,
						playlist,
						playlistEditService: this.viewModel.playlistEditService,
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

	handleContextMenuDismiss = (toastMessage?: string): void => {
		closeSlot(this.viewModel.navBarContext?.modalSlot ?? this.viewModel.modalSlot);
		this.setState({ contextMenuCard: null });
		if (toastMessage) {
			this.viewModel.toastService.show(toastMessage);
		}
	};

	private closeModalSlot = (): void => {
		closeSlot(this.viewModel.navBarContext?.modalSlot ?? this.viewModel.modalSlot);
	};

	handleAlbumCardLongPress = (card: {
		id: string;
		kind: 'album' | 'artist' | 'genre' | 'playlist';
	}): void => {
		const album = this.state.results.albums.find((a) => a.id === card.id);
		if (!album) return;
		this.setState({ contextMenuCard: { album, kind: 'album' } });
		this.openCardContextMenu({ album, kind: 'album' });
	};

	handleArtistCardLongPress = (card: {
		id: string;
		kind: 'album' | 'artist' | 'genre' | 'playlist';
	}): void => {
		const artist = this.state.results.artists.find((a) => a.id === card.id);
		if (!artist) return;
		this.setState({ contextMenuCard: { artist, kind: 'artist' } });
		this.openCardContextMenu({ artist, kind: 'artist' });
	};

	handlePlaylistCardLongPress = (card: {
		id: string;
		kind: 'album' | 'artist' | 'genre' | 'playlist';
	}): void => {
		const playlist = this.state.results.playlists.find((p) => p.id === card.id);
		if (!playlist) return;
		this.setState({ contextMenuCard: { kind: 'playlist', playlist } });
		this.openCardContextMenu({ kind: 'playlist', playlist });
	};

	private openCardContextMenu(card: CardContextMenuCard): void {
		this.cardContextMenuCard = card;
		const modalSlot = this.viewModel.navBarContext?.modalSlot ?? this.viewModel.modalSlot;
		const { animationsEnabled, playbackStore, transport } = this.viewModel;
		const onArtistTap =
			card.kind === 'album' || card.kind === 'artist'
				? this.handleCardContextMenuArtistTap
				: undefined;

		openCardContextMenu(modalSlot, {
			animationsEnabled,
			card,
			onAddToPlaylist: this.handleCardContextMenuAddToPlaylist,
			onArtistTap: onArtistTap,
			onCreatePlaylist: this.handleCardContextMenuCreatePlaylistRequest,
			onDismiss: this.handleContextMenuDismiss,
			onEntityTap: this.handleCardContextMenuEntityTap,
			playbackStore,
			transport,
		});
	}

	private handleCardContextMenuEntityTap = (): void => {
		const card = this.cardContextMenuCard;
		if (!card) return;
		this.handleContextMenuDismiss();
		if (card.kind === 'album') this.handleAlbumTap(card.album.id);
		if (card.kind === 'artist') this.handleArtistTap(card.artist.id);
		if (card.kind === 'playlist') this.handlePlaylistTap(card.playlist.id);
	};

	private handleCardContextMenuArtistTap = (): void => {
		const card = this.cardContextMenuCard;
		if (!card) return;
		this.handleContextMenuDismiss();
		if (card.kind === 'artist') {
			this.handleArtistTap(card.artist.id);
			return;
		}
		if (card.kind !== 'album') return;
		this.viewModel.transport.getArtist(card.album.artistId).then((artist) => {
			if (!artist) return;
			this.viewModel.navigationController.push(
				ArtistView,
				{
					animationsEnabled: this.viewModel.animationsEnabled,
					artist,
					downloadService: this.viewModel.downloadService,
					gridColumns: this.viewModel.gridColumns,
					imageCache: this.viewModel.imageCache,
					navBarContext: this.viewModel.navBarContext,
					paletteQueue: this.viewModel.paletteQueue,
					playbackStore: this.viewModel.playbackStore,
					toastService: this.viewModel.toastService,
					transport: this.viewModel.transport,
				},
				{},
				{ animated: this.viewModel.animationsEnabled },
			);
		});
	};

	private handleCardContextMenuAddToPlaylist = (tracks: Array<Track>): void => {
		this.setState({ contextMenuCard: null });
		openSlot(this.viewModel.navBarContext?.modalSlot ?? this.viewModel.modalSlot, () => {
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

	private handleCardContextMenuCreatePlaylistRequest = (tracks: Array<Track>): void => {
		this.pendingCreatePlaylistTracks = tracks;
		this.setState({ contextMenuCard: null });
		openSlot(this.viewModel.navBarContext?.modalSlot ?? this.viewModel.modalSlot, () => {
			<CreatePlaylistModal
				animationsEnabled={this.viewModel.animationsEnabled}
				onCancel={this.closeModalSlot}
				onCreate={this.handleCardContextMenuCreatePlaylistConfirm}
			/>;
		});
	};

	private handleCardContextMenuCreatePlaylistConfirm = async (name: string): Promise<void> => {
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
		this.viewModel.navigationController.push(
			PlaylistView,
			{
				animationsEnabled: this.viewModel.animationsEnabled,
				downloadService: this.viewModel.downloadService,
				gridColumns: this.viewModel.gridColumns,
				imageCache: this.viewModel.imageCache,
				navBarContext: this.viewModel.navBarContext,
				paletteQueue: this.viewModel.paletteQueue,
				playbackStore: this.viewModel.playbackStore,
				playlist,
				playlistEditService: this.viewModel.playlistEditService,
				toastService: this.viewModel.toastService,
				transport: this.viewModel.transport,
			},
			{},
			{ animated: this.viewModel.animationsEnabled },
		);
	};

	handleTrackTap = (trackId: string): void => {
		const trackIndex = this.state.results.tracks.findIndex((track) => track.id === trackId);
		if (trackIndex < 0) {
			return;
		}

		const track = this.state.results.tracks[trackIndex];
		this.viewModel.playbackStore.playTracks([track]);
		if (track.artistId) {
			this.viewModel.transport.getArtistLogoUrl(track.artistId).then((logoUrl) => {
				this.viewModel.playbackStore.setArtistLogoUrl(logoUrl);
			});
		}
	};

	handleSearchKeyboardSubmit = (value?: unknown): void => {
		const submittedQuery = normalizeSearchInput(value);
		this.handleSubmitSearch(submittedQuery || this.state.query);
	};

	handleSearchIconTap = (): void => {
		this.blurSearchInput();
		this.handleSubmitSearch(this.state.query);
	};

	handleQueryChange = (value: unknown): void => {
		this.setState({ query: normalizeSearchInput(value) });
	};

	handleRetryTap = (): void => {
		this.handleSubmitSearch(this.state.lastSubmittedQuery);
	};

	handleAlbumCardTap = (card: {
		id: string;
		kind: 'album' | 'artist' | 'genre' | 'playlist';
	}): void => {
		this.handleAlbumTap(card.id);
	};

	handleArtistCardTap = (card: {
		id: string;
		kind: 'album' | 'artist' | 'genre' | 'playlist';
	}): void => {
		this.handleArtistTap(card.id);
	};

	handlePlaylistCardTap = (card: {
		id: string;
		kind: 'album' | 'artist' | 'genre' | 'playlist';
	}): void => {
		this.handlePlaylistTap(card.id);
	};

	handleContextMenuArtistTap = (track: Track): void => {
		const { artistId } = track;
		if (!artistId) {
			return;
		}

		const {
			animationsEnabled,
			downloadService,
			gridColumns,
			imageCache,
			navigationController,
			paletteQueue,
			playbackStore,
			transport,
		} = this.viewModel;
		transport.getArtist(artistId).then((artist) => {
			if (!artist) return;
			navigationController.push(
				ArtistView,
				{
					animationsEnabled,
					artist,
					downloadService,
					gridColumns,
					imageCache,
					navBarContext: this.viewModel.navBarContext,
					paletteQueue,
					playbackStore,
					toastService: this.viewModel.toastService,
					transport,
				},
				{},
				{ animated: animationsEnabled },
			);
		});
	};

	private getRecentSearchTapHandler(term: string): () => void {
		const existingHandler = this.recentSearchTapHandlers.get(term);
		if (existingHandler) {
			return existingHandler;
		}

		const createdHandler = (): void => {
			this.blurSearchInput();
			this.setState({ query: term });
			this.handleSubmitSearch(term);
		};
		this.recentSearchTapHandlers.set(term, createdHandler);
		return createdHandler;
	}

	handleAlbumTap = (albumId: string): void => {
		const album = this.state.results.albums.find((candidate) => candidate.id === albumId);
		if (!album) {
			return;
		}

		if (this.viewModel.onNavigateToLibraryResult) {
			this.viewModel.onNavigateToLibraryResult({ album, kind: 'album' });
			return;
		}

		this.viewModel.navigationController.push(
			AlbumView,
			{
				album,
				animationsEnabled: this.viewModel.animationsEnabled,
				downloadService: this.viewModel.downloadService,
				gridColumns: this.viewModel.gridColumns,
				imageCache: this.viewModel.imageCache,
				navBarContext: this.viewModel.navBarContext,
				paletteQueue: this.viewModel.paletteQueue,
				playbackStore: this.viewModel.playbackStore,
				toastService: this.viewModel.toastService,
				transport: this.viewModel.transport,
			},
			{},
			{ animated: this.viewModel.animationsEnabled },
		);
	};

	handleArtistTap = (artistId: string): void => {
		const artist = this.state.results.artists.find((candidate) => candidate.id === artistId);
		if (!artist) {
			return;
		}

		if (this.viewModel.onNavigateToLibraryResult) {
			this.viewModel.onNavigateToLibraryResult({ artist, kind: 'artist' });
			return;
		}

		this.viewModel.navigationController.push(
			ArtistView,
			{
				animationsEnabled: this.viewModel.animationsEnabled,
				artist,
				downloadService: this.viewModel.downloadService,
				gridColumns: this.viewModel.gridColumns,
				imageCache: this.viewModel.imageCache,
				navBarContext: this.viewModel.navBarContext,
				paletteQueue: this.viewModel.paletteQueue,
				playbackStore: this.viewModel.playbackStore,
				toastService: this.viewModel.toastService,
				transport: this.viewModel.transport,
			},
			{},
			{ animated: this.viewModel.animationsEnabled },
		);
	};

	handlePlaylistTap = (playlistId: string): void => {
		const playlist = this.state.results.playlists.find((candidate) => candidate.id === playlistId);
		if (!playlist) {
			return;
		}

		if (this.viewModel.onNavigateToLibraryResult) {
			this.viewModel.onNavigateToLibraryResult({ kind: 'playlist', playlist });
			return;
		}

		const {
			animationsEnabled,
			downloadService,
			imageCache,
			navigationController,
			paletteQueue,
			playbackStore,
			transport,
		} = this.viewModel;
		const { navBarContext } = this.viewModel;
		navigationController.push(
			PlaylistView,
			{
				animationsEnabled,
				downloadService,
				gridColumns: this.viewModel.gridColumns,
				imageCache,
				navBarContext,
				onNavigateToArtist: (artistId) => {
					transport.getArtist(artistId).then((artist) => {
						if (!artist) return;
						navigationController.push(
							ArtistView,
							{
								animationsEnabled,
								artist,
								downloadService,
								gridColumns: this.viewModel.gridColumns,
								imageCache,
								navBarContext,
								paletteQueue,
								playbackStore,
								toastService: this.viewModel.toastService,
								transport,
							},
							{},
							{ animated: animationsEnabled },
						);
					});
				},
				paletteQueue,
				playbackStore,
				playlist,
				playlistEditService: this.viewModel.playlistEditService,
				toastService: this.viewModel.toastService,
				transport,
			},
			{},
			{ animated: this.viewModel.animationsEnabled },
		);
	};

	private renderSectionTitle(title: string): void {
		<label style={styles.sectionTitle} value={title} />;
	}

	private createTrackEntries(tracks: Array<Track>): Array<TrackListEntry> {
		return tracks.map((track) => ({
			artworkSource: track.albumImageUrl ?? null,
			id: track.id,
			meta: track.artistName ?? track.albumName ?? '',
			title: track.name,
			track,
		}));
	}

	private createAlbumCards(albums: Array<Album>): Array<Card> {
		return albums.map((album) => ({
			artworkKey: album.imageUrl ?? '',
			id: album.id,
			kind: 'album',
			primaryText: album.name,
			secondaryText: album.artistName,
		}));
	}

	private createArtistCards(artists: Array<Artist>): Array<Card> {
		return artists.map((artist) => ({
			artworkKey: artist.imageUrl ?? '',
			id: artist.id,
			kind: 'artist',
			primaryText: artist.name,
			secondaryText: '',
		}));
	}

	private createPlaylistCards(playlists: Array<Playlist>): Array<Card> {
		return playlists.map((playlist) => ({
			artworkKey: playlist.imageUrl ?? '',
			id: playlist.id,
			kind: 'playlist',
			primaryText: playlist.name,
			secondaryText: '',
		}));
	}

	onRender(): void {
		const { query, recentSearches, results, status } = this.state;
		const { imageCache } = this.viewModel;

		<layout accessibilityLabel='search-view' style={styles.searchRoot}>
			<scroll style={styles.scroll}>
				<view style={styles.root}>
					<view
						accessibilityId='search-bar'
						accessibilityLabel='search-bar'
						style={styles.searchBar}
					>
						<view
							accessibilityId='search-submit'
							accessibilityLabel='search-submit'
							onTap={this.handleSearchIconTap}
						>
							<image src={res.search} style={styles.searchIcon} tint={theme.colors.white} />
						</view>
						<textfield
							accessibilityId='search-input'
							accessibilityLabel='search-input'
							autocapitalization='none'
							keyboardAppearance='dark'
							onChange={this.handleQueryChange}
							onReturn={this.handleSearchKeyboardSubmit}
							placeholder={Strings.searchPlaceholder()}
							ref={this.searchInputRef}
							returnKeyText='search'
							style={styles.searchInput}
							value={query}
						/>
					</view>

					{status === 'loading' && (
						<LoopingArrowSpinner
							accessibilityId='search-loading-spinner'
							durationSeconds={0.9}
							label={Strings.searchLoading()}
							size={20}
						/>
					)}

					{status === 'error' && (
						<view style={styles.infoContainer}>
							<label style={styles.errorTitle} value={Strings.searchFailed()} />
							<label
								style={styles.errorText}
								value={this.state.errorMessage ?? Strings.searchCouldNotSearch()}
							/>
							<view
								accessibilityId='search-retry'
								accessibilityLabel='search-retry'
								onTap={this.handleRetryTap}
								style={styles.retryButton}
							>
								<label style={styles.retryButtonText} value={Strings.searchRetry()} />
							</view>
						</view>
					)}

					{status === 'empty' && (
						<view style={styles.infoContainer}>
							<label style={styles.emptyTitle} value={Strings.searchEmpty()} />
						</view>
					)}

					{status === 'success' && (
						<layout style={styles.resultsContainer}>
							{results.artists.length > 0 && (
								<layout style={styles.section}>
									{this.renderSectionTitle(Strings.searchSectionArtists())}
									<CardGrid
										accessibilityId='search-artists-grid'
										cards={this.createArtistCards(results.artists)}
										columnCount={this.viewModel.gridColumns}
										onCardLongPress={this.handleArtistCardLongPress}
										onCardTap={this.handleArtistCardTap}
									/>
								</layout>
							)}

							{results.albums.length > 0 && (
								<layout style={styles.section}>
									{this.renderSectionTitle(Strings.searchSectionAlbums())}
									<CardGrid
										accessibilityId='search-albums-grid'
										cards={this.createAlbumCards(results.albums)}
										columnCount={this.viewModel.gridColumns}
										onCardLongPress={this.handleAlbumCardLongPress}
										onCardTap={this.handleAlbumCardTap}
									/>
								</layout>
							)}

							{results.playlists.length > 0 && (
								<layout style={styles.section}>
									{this.renderSectionTitle(Strings.searchSectionPlaylists())}
									<CardGrid
										accessibilityId='search-playlists-grid'
										cards={this.createPlaylistCards(results.playlists)}
										columnCount={this.viewModel.gridColumns}
										onCardLongPress={this.handlePlaylistCardLongPress}
										onCardTap={this.handlePlaylistCardTap}
									/>
								</layout>
							)}

							{results.tracks.length > 0 && (
								<layout style={styles.section}>
									{this.renderSectionTitle(Strings.searchSectionTracks())}
									<TrackList
										imageCache={imageCache}
										onTrackLongPress={this.handleTrackLongPress}
										onTrackTap={this.handleTrackTap}
										tracks={this.createTrackEntries(results.tracks)}
									/>
								</layout>
							)}
						</layout>
					)}

					<layout style={styles.recentSection}>
						<label style={styles.sectionTitle} value={Strings.searchSectionRecent()} />
						{recentSearches.length === 0 ? (
							<label style={styles.recentEmpty} value={Strings.searchNoRecent()} />
						) : (
							recentSearches.map((term) => (
								<view
									accessibilityId={`recent-search-${term}`}
									key={term}
									onTap={this.getRecentSearchTapHandler(term)}
									style={styles.recentSearchChip}
								>
									<image
										src={res.search}
										style={styles.recentSearchIcon}
										tint={theme.colors.grey}
									/>
									<label style={styles.recentSearchText} value={term} />
								</view>
							))
						)}
					</layout>
				</view>
			</scroll>
		</layout>;
	}
}

const styles = {
	emptyText: new Style<Label>({
		...theme.text.sub,
		marginTop: 8,
		textAlign: 'center',
	}),
	emptyTitle: new Style<Label>({
		...theme.text.mainBold,
		marginBottom: 20,
		textAlign: 'center',
	}),
	errorText: new Style<Label>({
		...theme.text.sub,
		marginTop: 4,
		textAlign: 'center',
	}),
	errorTitle: new Style<Label>({
		...theme.text.mainBold,
		color: theme.colors.destructive,
		textAlign: 'center',
	}),
	infoContainer: new Style<Layout>({
		alignItems: 'center',
		paddingBottom: 16,
		paddingTop: 16,
		width: '100%',
	}),
	recentEmpty: new Style<Label>({
		...theme.text.sub,
		marginTop: 8,
	}),
	recentSearchChip: new Style<View>({
		flexDirection: 'row',
		flexGrow: 1,
		marginTop: 4,
		padding: 4,
		width: '100%',
	}),
	recentSearchIcon: new Style<ImageView>({
		height: 18,
		margin: 10,
		width: 18,
	}),
	recentSearchText: new Style<Label>({
		...theme.text.subLarger,
	}),
	recentSection: new Style<Layout>({
		marginTop: 8,
		paddingBottom: 12,
		width: '100%',
	}),
	resultsContainer: new Style<Layout>({
		marginTop: 10,
		width: '100%',
	}),
	retryButton: new Style<View>({
		backgroundColor: theme.colors.bgAccent,
		borderRadius: theme.radius.default,
		paddingBottom: 8,
		paddingLeft: 12,
		paddingRight: 12,
		paddingTop: 8,
	}),
	retryButtonText: new Style<Label>({
		...theme.text.main,
		color: theme.colors.active,
	}),
	root: new Style<View>({
		padding: 20,
		paddingTop: 20 + theme.padding.deviceInset,
		width: '100%',
	}),
	scroll: new Style<ScrollView>({
		backgroundColor: theme.colors.bg,
		flexGrow: 1,
		paddingBottom: theme.padding.scrollBottom,
		width: '100%',
	}),
	searchBar: new Style<View>({
		alignItems: 'center',
		backgroundColor: 'transparent',
		borderColor: theme.colors.white,
		borderRadius: theme.radius.pill,
		borderWidth: 1,
		flexDirection: 'row',
		marginBottom: 20,
		padding: 12,
	}),
	searchIcon: new Style<ImageView>({
		height: 24,
		width: 24,
	}),
	searchInput: new Style({
		...theme.text.main,
		flexGrow: 1,
		marginLeft: 20,
		padding: theme.padding.pill,
	}),
	searchRoot: new Style<Layout>({
		flexGrow: 1,
		width: '100%',
	}),
	section: new Style<Layout>({
		marginBottom: 18,
		width: '100%',
	}),
	sectionTitle: new Style<Label>({
		...theme.text.mutedHeader,
		marginBottom: 8,
	}),
};
