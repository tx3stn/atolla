// @ts-nocheck
import res from 'atolla/res';
import { StatefulComponent } from 'valdi_core/src/Component';
import { ElementRef } from 'valdi_core/src/ElementRef';
import { Style } from 'valdi_core/src/Style';
import type { NavigationController } from 'valdi_navigation/src/NavigationController';
import type { ImageView, Label } from 'valdi_tsx/src/NativeTemplateElements';
import type { Album } from '../../models/Album';
import type { Artist } from '../../models/Artist';
import type { Playlist } from '../../models/Playlist';
import type { Track } from '../../models/Track';
import type { ImageCache } from '../../services/ImageCache';
import type { PlaybackStore } from '../../stores/Playback';
import type { SearchStore } from '../../stores/Search';
import { scrollPaddingBottom, theme } from '../../theme';
import type { SearchResults, Transport } from '../../transports/Transport';
import { type Card, CardGrid } from '../components/CardGrid';
import { Spinner } from '../components/Spinner';
import { Toast } from '../components/Toast';
import { TrackContextMenu } from '../components/TrackContextMenu';
import { TrackList, type TrackListEntry } from '../components/TrackList';
import { AlbumView } from './AlbumView';
import { ArtistView } from './ArtistView';
import { PlaylistView } from './PlaylistView';

const noResultFrames = [
	'No results. The crate is empty.',
	'No results. Dig deeper.',
	'No results. Try another cut.',
];

type SearchStatus = 'idle' | 'loading' | 'success' | 'empty' | 'error';

export interface SearchViewModel {
	animationsEnabled: boolean;
	focusSignal?: number;
	imageCache: ImageCache;
	navigationController: NavigationController;
	onNavigateToHomeResult?: (target: SearchHomeNavigationTarget) => void;
	playbackStore: PlaybackStore;
	searchStore: SearchStore;
	transport: Transport;
}

export type SearchHomeNavigationTarget =
	| { album: Album; kind: 'album' }
	| { artist: Artist; kind: 'artist' }
	| { kind: 'playlist'; playlist: Playlist };

interface SearchState {
	contextMenuTrack: Track | null;
	errorMessage: string | null;
	isFooterVisible: boolean;
	lastSubmittedQuery: string;
	noResultFrameIndex: number;
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
	private noResultTimer?: ReturnType<typeof setInterval>;
	private requestVersion = 0;
	private searchInputRef = new ElementRef();
	private unsubscribePlayback?: () => void;

	state: SearchState = {
		contextMenuTrack: null,
		errorMessage: null,
		isFooterVisible: false,
		lastSubmittedQuery: '',
		noResultFrameIndex: 0,
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

		this.noResultTimer = setInterval(() => {
			if (this.state.status !== 'empty') {
				return;
			}

			this.setState({
				noResultFrameIndex: (this.state.noResultFrameIndex + 1) % noResultFrames.length,
			});
		}, 420);
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
		if (this.noResultTimer) {
			clearInterval(this.noResultTimer);
		}
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
			this.setState({ toastMessage });
			setTimeout(() => {
				this.setState({ toastMessage: null });
			}, 2000);
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

	handleAlbumTap = (albumId: string): void => {
		const album = this.state.results.albums.find((candidate) => candidate.id === albumId);
		if (!album) {
			return;
		}

		if (this.viewModel.onNavigateToHomeResult) {
			this.viewModel.onNavigateToHomeResult({ album, kind: 'album' });
			return;
		}

		this.viewModel.navigationController.push(
			AlbumView,
			{
				album,
				animationsEnabled: this.viewModel.animationsEnabled,
				imageCache: this.viewModel.imageCache,
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

		if (this.viewModel.onNavigateToHomeResult) {
			this.viewModel.onNavigateToHomeResult({ artist, kind: 'artist' });
			return;
		}

		this.viewModel.navigationController.push(
			ArtistView,
			{
				animationsEnabled: this.viewModel.animationsEnabled,
				artist,
				imageCache: this.viewModel.imageCache,
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

		if (this.viewModel.onNavigateToHomeResult) {
			this.viewModel.onNavigateToHomeResult({ kind: 'playlist', playlist });
			return;
		}

		const { animationsEnabled, imageCache, navigationController, playbackStore, transport } =
			this.viewModel;
		navigationController.push(
			PlaylistView,
			{
				imageCache,
				onNavigateToArtist: (artistId) => {
					transport.getArtist(artistId).then((artist) => {
						if (!artist) return;
						navigationController.push(
							ArtistView,
							{ animationsEnabled, artist, imageCache, playbackStore, transport },
							{},
							{ animated: animationsEnabled },
						);
					});
				},
				playbackStore,
				playlist,
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

		<layout style={styles.searchRoot}>
			<scroll style={createScrollStyle(this.state.isFooterVisible)}>
				<view style={styles.root}>
					<view
						accessibilityLabel='search-bar'
						contentDescription='search-bar'
						style={styles.searchBar}
					>
						<image src={res.search} style={styles.searchIcon} tint={theme.colors.white} />
						<textfield
							autocapitalization='none'
							keyboardAppearance='dark'
							onChange={(text) => {
								this.setState({ query: normalizeSearchInput(text) });
							}}
							onDone={this.handleSearchKeyboardSubmit}
							onReturn={this.handleSearchKeyboardSubmit}
							onSubmit={this.handleSearchKeyboardSubmit}
							placeholder='search'
							ref={this.searchInputRef}
							returnKeyText='search'
							style={styles.searchInput}
							value={query}
						/>
					</view>

					{status === 'loading' && (
						<Spinner
							accessibilityLabel='search-loading-spinner'
							label='Searching your library...'
						/>
					)}

					{status === 'error' && (
						<view style={styles.infoContainer}>
							<label style={styles.errorTitle} value='Search failed' />
							<label
								style={styles.errorText}
								value={this.state.errorMessage ?? 'Could not search right now.'}
							/>
							<view
								accessibilityLabel='search-retry'
								contentDescription='search-retry'
								onTap={() => {
									this.handleSubmitSearch(this.state.lastSubmittedQuery);
								}}
								style={styles.retryButton}
							>
								<label style={styles.retryButtonText} value='Retry' />
							</view>
						</view>
					)}

					{status === 'empty' && (
						<view style={styles.infoContainer}>
							<label style={styles.emptyTitle} value='No matches found' />
							<label
								style={styles.emptyText}
								value={noResultFrames[this.state.noResultFrameIndex]}
							/>
						</view>
					)}

					{status === 'success' && (
						<layout style={styles.resultsContainer}>
							{results.tracks.length > 0 && (
								<layout style={styles.section}>
									{this.renderSectionTitle('TRACKS')}
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
									{this.renderSectionTitle('ALBUMS')}
									<CardGrid
										accessibilityLabel='search-albums-grid'
										cards={this.createAlbumCards(results.albums)}
										imageCache={this.viewModel.imageCache}
										onCardTap={(card) => this.handleAlbumTap(card.id)}
									/>
								</layout>
							)}

							{results.artists.length > 0 && (
								<layout style={styles.section}>
									{this.renderSectionTitle('ARTISTS')}
									<CardGrid
										accessibilityLabel='search-artists-grid'
										cards={this.createArtistCards(results.artists)}
										imageCache={this.viewModel.imageCache}
										onCardTap={(card) => this.handleArtistTap(card.id)}
									/>
								</layout>
							)}

							{results.playlists.length > 0 && (
								<layout style={styles.section}>
									{this.renderSectionTitle('PLAYLISTS')}
									<CardGrid
										accessibilityLabel='search-playlists-grid'
										cards={this.createPlaylistCards(results.playlists)}
										imageCache={this.viewModel.imageCache}
										onCardTap={(card) => this.handlePlaylistTap(card.id)}
									/>
								</layout>
							)}
						</layout>
					)}

					<layout style={styles.recentSection}>
						<label style={styles.sectionTitle} value='RECENT SEARCHES' />
						{recentSearches.length === 0 ? (
							<label style={styles.recentEmpty} value='No recent searches yet.' />
						) : (
							recentSearches.map((term) => (
								<view
									accessibilityLabel={`recent-search-${term}`}
									contentDescription={`recent-search-${term}`}
									key={term}
									onTap={() => {
										this.blurSearchInput();
										this.setState({ query: term });
										this.handleSubmitSearch(term);
									}}
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
					imageCache={imageCache}
					onArtistTap={
						contextMenuTrack.artistId
							? ((artistId) => () => {
									const {
										animationsEnabled,
										imageCache: ic,
										navigationController,
										playbackStore: ps,
										transport: t,
									} = this.viewModel;
									t.getArtist(artistId).then((artist) => {
										if (!artist) return;
										navigationController.push(
											ArtistView,
											{
												animationsEnabled,
												artist,
												imageCache: ic,
												playbackStore: ps,
												transport: t,
											},
											{},
											{ animated: animationsEnabled },
										);
									});
								})(contextMenuTrack.artistId)
							: undefined
					}
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

function createScrollStyle(isFooterVisible: boolean): Style {
	return new Style({
		backgroundColor: theme.colors.bg,
		flexGrow: 1,
		paddingBottom: scrollPaddingBottom(isFooterVisible),
		width: '100%',
	});
}

const styles = {
	emptyText: new Style<Label>({
		...theme.text.sub,
		marginTop: 8,
		textAlign: 'center',
	}),
	emptyTitle: new Style<Label>({
		...theme.text.mainBold,
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
	infoContainer: new Style({
		alignItems: 'center',
		paddingVertical: 16,
		rowGap: 8,
		width: '100%',
	}),
	recentEmpty: new Style<Label>({
		...theme.text.sub,
		marginTop: 8,
	}),
	recentSearchChip: new Style({
		...theme.text.subLarger,
		flexDirection: 'row',
		flexGrow: 1,
		marginTop: 8,
		paddingHorizontal: 12,
		paddingVertical: 10,
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
	recentSection: new Style({
		marginTop: 8,
		paddingBottom: 12,
		width: '100%',
	}),
	resultsContainer: new Style({
		marginTop: 10,
		width: '100%',
	}),
	retryButton: new Style({
		backgroundColor: theme.colors.bgAccent,
		borderRadius: theme.borderRadius,
		paddingHorizontal: 12,
		paddingVertical: 8,
	}),
	retryButtonText: new Style<Label>({
		...theme.text.main,
		color: theme.colors.active,
	}),
	root: new Style({
		padding: 20,
		width: '100%',
	}),
	searchBar: new Style({
		alignItems: 'center',
		backgroundColor: 'transparent',
		borderColor: theme.colors.white,
		borderRadius: 999,
		borderWidth: 1,
		columnGap: 10,
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
	searchRoot: new Style({
		flexGrow: 1,
		width: '100%',
	}),
	section: new Style({
		marginBottom: 18,
		width: '100%',
	}),
	sectionTitle: new Style<Label>({
		...theme.text.mutedHeader,
		marginBottom: 8,
	}),
};
