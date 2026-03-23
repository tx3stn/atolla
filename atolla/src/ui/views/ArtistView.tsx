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
import { TrackList, type TrackListEntry } from '../components/TrackList';
import { AlbumView } from './AlbumView';

export interface ArtistViewModel {
	animationsEnabled: boolean;
	artist: Artist;
	imageCache: ImageCache;
	playbackStore: PlaybackStore;
	transport: Transport;
}

interface ArtistState {
	albums: Array<Album>;
	allTracks: Array<Track>;
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
		isFooterVisible: false,
		topTracks: [],
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
	}

	onRender(): void {
		const { artist, animationsEnabled, imageCache, playbackStore, transport } = this.viewModel;
		const { albums, allTracks, isFooterVisible, topTracks } = this.state;

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
		}));

		const scrollStyle = createScrollStyle(isFooterVisible);

		<layout accessibilityLabel='artist-view' contentDescription='artist-view' style={styles.root}>
			<scroll style={scrollStyle}>
				<DetailHeader
					artworkCategory='artist_image'
					artworkSource={artist.imageUrl ?? null}
					fallbackText={artist.name}
					imageCache={imageCache}
					logoSource={artist.logoUrl || null}
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
							onCardTap={(card) => {
								const album = this.state.albums.find((a) => a.id === card.id);
								if (album) {
									this.navigationController.push(
										AlbumView,
										{ album, imageCache, playbackStore, transport },
										{},
										{ animated: animationsEnabled },
									);
								}
							}}
						/>
					</layout>
				)}

				{trackEntries.length > 0 && (
					<layout style={styles.section}>
						<label style={styles.sectionHeader} value='TOP TRACKS' />
						<TrackList imageCache={imageCache} tracks={trackEntries} />
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
	return new Style({
		backgroundColor: theme.colors.bg,
		flexGrow: 1,
		padding: 8,
		paddingBottom: scrollPaddingBottom(isFooterVisible),
		width: '100%',
	});
}
