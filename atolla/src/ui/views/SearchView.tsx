import res from 'atolla/res';
import { StatefulComponent } from 'valdi_core/src/Component';
import { ElementRef } from 'valdi_core/src/ElementRef';
import { Style } from 'valdi_core/src/Style';
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
import type { PlaybackStore } from '../../stores/Playback';
import type { SearchStore } from '../../stores/Search';
import { scrollPaddingBottom, theme } from '../../theme';
import type { Transport } from '../../transports/Transport';
import { type Card, CardGrid } from '../components/CardGrid';
import { LoopingArrowSpinner } from '../components/LoopingArrowSpinner';
import { Toast } from '../components/Toast';
import { TrackContextMenu } from '../components/TrackContextMenu';
import { TrackList, type TrackListEntry } from '../components/TrackList';
import { clearScheduledToast, scheduleToastDismiss } from '../components/toastTimer';
import type { NavBarContext } from '../NavBarContext';
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
	navBarContext?: NavBarContext;
	navigationController: NavigationController;
	onNavigateToLibraryResult?: (target: SearchLibraryNavigationTarget) => void;
	paletteQueue?: PaletteGenerationQueue;
	playbackStore: PlaybackStore;
	playlistEditService: PlaylistEditService;
	searchStore: SearchStore;
	transport: Transport;
}

export type SearchLibraryNavigationTarget =
	| { album: Album; kind: 'album' }
	| { artist: Artist; kind: 'artist' }
	| { kind: 'playlist'; playlist: Playlist };

interface SearchState {
	contextMenuTrack: Track | null;
	errorMessage: string | null;
	isFooterVisible: boolean;
	lastSubmittedQuery: string;
	query: string;
	recentSearches: Array<string>;
	results: SearchResults;
	status: SearchStatus;
	toastMessage: string | null;
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
	private hasBeenDestroyed = false;
	private requestVersion = 0;
	private recentSearchTapHandlers = new Map<string, () => void>();
	private searchInputRef = new ElementRef();
	private toastTimerId?: ReturnType<typeof setTimeout>;
	private unsubscribePlayback?: () => void;

	state: SearchState = {
		contextMenuTrack: null,
		errorMessage: null,
		isFooterVisible: false,
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
		toastMessage: null,
	};

	onCreate(): void {
		this.hasBeenDestroyed = false;
		this.focusSearchInput();
		this.unsubscribePlayback = this.viewModel.playbackStore.subscribe(() => {
			const isFooterVisible = this.viewModel.playbackStore.track !== null;
			if (isFooterVisible !== this.state.isFooterVisible) {
				this.setState({ isFooterVisible });
			}
		});
		const isFooterVisible = this.viewModel.playbackStore.track !== null;
		if (isFooterVisible !== this.state.isFooterVisible) {
			this.setState({ isFooterVisible });
		}

		this.viewModel.searchStore.getRecentSearches().then((recentSearches) => {
			if (this.hasBeenDestroyed) {
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
			if (this.hasBeenDestroyed) {
				return;
			}
			this.searchInputRef.setAttribute('focused', true);
			this.searchInputRef.setAttribute('selection', [
				this.state.query.length,
				this.state.query.length,
			]);
			setTimeout(() => {
				if (this.hasBeenDestroyed) {
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

	onDestroy(): void {
		this.hasBeenDestroyed = true;
		this.unsubscribePlayback?.();
		this.toastTimerId = clearScheduledToast(this.toastTimerId);
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
			if (this.hasBeenDestroyed || currentRequestVersion !== this.requestVersion) {
				return;
			}

			this.setState({ recentSearches });
		});

		this.viewModel.transport
			.search(trimmedQuery)
			.then((results) => {
				if (this.hasBeenDestroyed || currentRequestVersion !== this.requestVersion) {
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
				if (this.hasBeenDestroyed || currentRequestVersion !== this.requestVersion) {
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
		this.setState({ contextMenuTrack: track });
	};

	handleContextMenuDismiss = (toastMessage?: string): void => {
		this.setState({ contextMenuTrack: null });
		if (toastMessage) {
			this.toastTimerId = scheduleToastDismiss(
				this.toastTimerId,
				(message) => {
					this.setState({ toastMessage: message });
				},
				toastMessage,
			);
		}
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

	handleContextMenuArtistTap = (): void => {
		const artistId = this.state.contextMenuTrack?.artistId;
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
		const { contextMenuTrack, query, recentSearches, results, status, toastMessage } = this.state;
		const { imageCache, playbackStore, transport } = this.viewModel;

		<layout accessibilityLabel='search-view' style={styles.searchRoot}>
			<scroll style={createScrollStyle(this.state.isFooterVisible)}>
				<view style={styles.root}>
					<view accessibilityLabel='search-bar' style={styles.searchBar}>
						<image src={res.search} style={styles.searchIcon} tint={theme.colors.white} />
						<textfield
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
							accessibilityLabel='search-loading-spinner'
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

							{results.albums.length > 0 && (
								<layout style={styles.section}>
									{this.renderSectionTitle(Strings.searchSectionAlbums())}
									<CardGrid
										accessibilityLabel='search-albums-grid'
										cards={this.createAlbumCards(results.albums)}
										columnCount={this.viewModel.gridColumns}
										onCardTap={this.handleAlbumCardTap}
									/>
								</layout>
							)}

							{results.artists.length > 0 && (
								<layout style={styles.section}>
									{this.renderSectionTitle(Strings.searchSectionArtists())}
									<CardGrid
										accessibilityLabel='search-artists-grid'
										cards={this.createArtistCards(results.artists)}
										columnCount={this.viewModel.gridColumns}
										onCardTap={this.handleArtistCardTap}
									/>
								</layout>
							)}

							{results.playlists.length > 0 && (
								<layout style={styles.section}>
									{this.renderSectionTitle(Strings.searchSectionPlaylists())}
									<CardGrid
										accessibilityLabel='search-playlists-grid'
										cards={this.createPlaylistCards(results.playlists)}
										columnCount={this.viewModel.gridColumns}
										onCardTap={this.handlePlaylistCardTap}
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
									accessibilityLabel={`recent-search-${term}`}
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
			{contextMenuTrack && (
				<TrackContextMenu
					animationsEnabled={this.viewModel.animationsEnabled}
					imageCache={imageCache}
					onArtistTap={contextMenuTrack.artistId ? this.handleContextMenuArtistTap : undefined}
					onDismiss={this.handleContextMenuDismiss}
					playbackStore={playbackStore}
					track={contextMenuTrack}
					transport={transport}
				/>
			)}
			{toastMessage && <Toast message={toastMessage} />}
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
		color: '#ff6b6b',
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
		borderRadius: theme.borderRadius,
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
		width: '100%',
	}),
	searchBar: new Style<View>({
		alignItems: 'center',
		backgroundColor: 'transparent',
		borderColor: theme.colors.white,
		borderRadius: 999,
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
		padding: 8,
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
