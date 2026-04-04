// @ts-nocheck
import { Style } from 'valdi_core/src/Style';
import { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';
import { DetachedSlotRenderer } from 'valdi_core/src/slot/DetachedSlotRenderer';
import { NavigationPage } from 'valdi_navigation/src/NavigationPage';
import { NavigationPageStatefulComponent } from 'valdi_navigation/src/NavigationPageComponent';
import type { Album } from '../../models/Album';
import type { Artist } from '../../models/Artist';
import type { Track } from '../../models/Track';
import type { ImageCache } from '../../services/ImageCache';
import { type PlaybackStore, shuffleArray } from '../../stores/Playback';
import { scrollPaddingBottom, theme } from '../../theme';
import type { Transport } from '../../transports/Transport';
import { BioSection } from '../components/BioSection';
import { type Card, CardGrid } from '../components/CardGrid';
import { DetailHeader } from '../components/DetailHeader';
import { TrackContextMenu } from '../components/TrackContextMenu';
import { TrackList, type TrackListEntry } from '../components/TrackList';
import { AlbumView } from './AlbumView';

export interface ArtistViewModel {
	animationsEnabled: boolean;
	artist: Artist;
	imageCache: ImageCache;
	onExitFromSearchNavigation?: () => void;
	playbackStore: PlaybackStore;
	transport: Transport;
}

interface ArtistState {
	albums: Array<Album>;
	allTracks: Array<Track>;
	contextMenuTrack: Track | null;
	isDownloaded: boolean;
	isFooterVisible: boolean;
	topTracks: Array<Track>;
}

@NavigationPage(module)
export class ArtistView extends NavigationPageStatefulComponent<ArtistViewModel, ArtistState> {
	private modalSlot = new DetachedSlot();
	private hasBeenDestroyed = false;
	private unsubscribePlayback?: () => void;

	state: ArtistState = {
		albums: [],
		allTracks: [],
		contextMenuTrack: null,
		isDownloaded: false,
		isFooterVisible: false,
		topTracks: [],
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
		this.setState({ isDownloaded: !this.state.isDownloaded });
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

	handleAlbumCardTap = (card: Card): void => {
		const album = this.state.albums.find((candidate) => candidate.id === card.id);
		if (!album) {
			return;
		}

		const { animationsEnabled, imageCache, playbackStore, transport } = this.viewModel;
		this.navigationController.push(
			AlbumView,
			{ album, animationsEnabled, imageCache, playbackStore, transport },
			{},
			{ animated: animationsEnabled },
		);
	};

	handleAlbumCardLongPress = (card: Card): void => {
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

	onCreate(): void {
		this.hasBeenDestroyed = false;
		const { artist, playbackStore, transport } = this.viewModel;
		this.unsubscribePlayback = playbackStore.subscribe(() => {
			this.setState({ isFooterVisible: playbackStore.track !== null });
		});
		this.setState({ isFooterVisible: playbackStore.track !== null });
		transport.getAlbumsByArtist(artist.id).then((albums) => {
			if (this.hasBeenDestroyed) {
				return;
			}
			this.setState({ albums });
		});
		transport.getTracksByArtist(artist.id).then((allTracks) => {
			if (this.hasBeenDestroyed) {
				return;
			}
			this.setState({ allTracks });
		});
		transport.getArtistTopTracks(artist.id).then((topTracks) => {
			if (this.hasBeenDestroyed) {
				return;
			}
			this.setState({ topTracks });
		});
	}

	onDestroy(): void {
		this.hasBeenDestroyed = true;
		this.unsubscribePlayback?.();
		this.viewModel.onExitFromSearchNavigation?.();
	}

	onRender(): void {
		const { artist, animationsEnabled, imageCache, playbackStore, transport } = this.viewModel;
		const { albums, allTracks, contextMenuTrack, isDownloaded, isFooterVisible, topTracks } =
			this.state;

		const sortedAlbums = [...albums].sort((a, b) =>
			(b.releaseDate ?? '').localeCompare(a.releaseDate ?? ''),
		);
		const albumCards: Array<Card> = sortedAlbums.map((album) => ({
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

		const scrollStyle = createScrollStyle(isFooterVisible);

		<layout accessibilityLabel='artist-view' contentDescription='artist-view' style={styles.root}>
			<scroll style={scrollStyle}>
				<DetailHeader
					animationsEnabled={animationsEnabled}
					artworkCategory='artist_image'
					artworkSource={artist.imageUrl ?? null}
					fallbackText={artist.name}
					imageCache={imageCache}
					isDownloaded={isDownloaded}
					logoSource={artist.logoUrl || null}
					onAddToQueue={allTracks.length > 0 ? this.handleHeaderAddToQueueTap : undefined}
					onDownload={this.handleDownloadTap}
					onPlay={allTracks.length > 0 ? this.handleHeaderPlayTap : undefined}
					onShuffle={allTracks.length > 0 ? this.handleHeaderShuffleTap : undefined}
				/>

				{albums.length > 0 && (
					<layout style={styles.section}>
						<layout style={styles.sectionHeaderRow}>
							<label style={styles.sectionHeader} value='ALBUMS' />
							<label style={styles.sectionCount} value={`[ ${albums.length} ]`} />
						</layout>
						<CardGrid
							accessibilityLabel='artist-albums-grid'
							cards={albumCards}
							imageCache={imageCache}
							onCardLongPress={this.handleAlbumCardLongPress}
							onCardTap={this.handleAlbumCardTap}
						/>
					</layout>
				)}

				{trackEntries.length > 0 && (
					<layout style={styles.section}>
						<label style={styles.sectionHeader} value='TOP TRACKS' />
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
		</layout>;
	}
}

const styles = {
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
	sectionHeaderRow: new Style({
		alignItems: 'center',
		flexDirection: 'row',
		justifyContent: 'space-between',
		width: '100%',
	}),
};

function createScrollStyle(isFooterVisible: boolean): Style {
	return isFooterVisible ? scrollStyles.withFooter : scrollStyles.withoutFooter;
}

const scrollStyles = {
	withFooter: new Style({
		backgroundColor: theme.colors.bg,
		flexGrow: 1,
		padding: 8,
		paddingBottom: scrollPaddingBottom(true),
		paddingTop: theme.headerHeight,
		width: '100%',
	}),
	withoutFooter: new Style({
		backgroundColor: theme.colors.bg,
		flexGrow: 1,
		padding: 8,
		paddingBottom: scrollPaddingBottom(false),
		paddingTop: theme.headerHeight,
		width: '100%',
	}),
};
