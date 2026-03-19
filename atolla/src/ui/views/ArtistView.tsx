// @ts-nocheck
import { StatefulComponent } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';
import { DetachedSlotRenderer } from 'valdi_core/src/slot/DetachedSlotRenderer';
import type { Album } from '../../models/Album';
import type { Artist } from '../../models/Artist';
import type { Track } from '../../models/Track';
import { theme } from '../../theme';
import type { Transport } from '../../transports/Transport';
import { BioSection } from '../components/BioSection';
import { type Card, CardGrid } from '../components/CardGrid';
import { DetailHeader } from '../components/DetailHeader';
import { TrackList, type TrackListEntry } from '../components/TrackList';
import { AlbumView } from './AlbumView';

export interface ArtistViewModel {
	artist: Artist;
	transport: Transport;
}

interface ArtistState {
	albums: Array<Album>;
	selectedAlbum: Album | null;
	topTracks: Array<Track>;
}

export class ArtistView extends StatefulComponent<ArtistViewModel, ArtistState> {
	private modalSlot = new DetachedSlot();

	state: ArtistState = {
		albums: [],
		selectedAlbum: null,
		topTracks: [],
	};

	onCreate(): void {
		const { artist, transport } = this.viewModel;
		transport.getAlbumsByArtist(artist.id).then((albums) => {
			this.setState({ albums });
		});
		transport.getArtistTopTracks(artist.id).then((topTracks) => {
			this.setState({ topTracks });
		});
	}

	onRender(): void {
		if (this.state.selectedAlbum) {
			<AlbumView album={this.state.selectedAlbum} transport={this.viewModel.transport} />;
			return;
		}

		const { artist } = this.viewModel;
		const { albums, topTracks } = this.state;

		const sortedAlbums = [...albums].sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
		const albumCards: Array<Card> = sortedAlbums.map((album) => ({
			artworkKey: album.imageUrl ?? '',
			id: album.id,
			kind: 'album',
			primaryText: album.name,
			secondaryText: String(album.year ?? ''),
		}));

		const trackEntries: Array<TrackListEntry> = topTracks.slice(0, 5).map((track) => ({
			artworkSource: track.albumImageUrl ?? null,
			id: track.id,
			meta: track.albumName ?? '',
			title: track.name,
		}));

		<layout style={styles.root}>
			<scroll style={styles.scroll}>
				<DetailHeader artworkSource={artist.imageUrl ?? null} fallbackText={artist.name} />

				{albums.length > 0 && (
					<layout style={styles.section}>
						<layout style={styles.sectionHeaderRow}>
							<label style={styles.sectionHeader} value='ALBUMS' />
							<label style={styles.sectionCount} value={`[ ${albums.length} ]`} />
						</layout>
						<CardGrid
							accessibilityLabel='artist-albums-grid'
							cards={albumCards}
							onCardTap={(card) => {
								const album = this.state.albums.find((a) => a.id === card.id) ?? null;
								this.setState({ selectedAlbum: album });
							}}
							resolveArtworkSource={(key) => key || null}
						/>
					</layout>
				)}

				{trackEntries.length > 0 && (
					<layout style={styles.section}>
						<label style={styles.sectionHeader} value='TOP TRACKS' />
						<TrackList tracks={trackEntries} />
					</layout>
				)}

				{artist.bio && (
					<BioSection bio={artist.bio} modalSlot={this.modalSlot} title={artist.name} />
				)}
			</scroll>
			<DetachedSlotRenderer detachedSlot={this.modalSlot} />
		</layout>;
	}
}

const styles = {
	root: new Style({
		flexGrow: 1,
		width: '100%',
	}),
	scroll: new Style({
		flexGrow: 1,
		padding: 8,
		paddingBottom: theme.scrollPaddingBottom,
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
