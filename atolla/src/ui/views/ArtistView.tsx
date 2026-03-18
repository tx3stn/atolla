// @ts-nocheck
import { StatefulComponent } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { Label } from 'valdi_tsx/src/NativeTemplateElements';
import type { Album } from '../../models/Album';
import type { Artist } from '../../models/Artist';
import type { Track } from '../../models/Track';
import { theme } from '../../theme';
import type { Transport } from '../../transports/Transport';
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
	showBioModal: boolean;
	topTracks: Array<Track>;
}

export class ArtistView extends StatefulComponent<ArtistViewModel, ArtistState> {
	state: ArtistState = {
		albums: [],
		selectedAlbum: null,
		showBioModal: false,
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
		const { albums, showBioModal, topTracks } = this.state;

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
						<label style={styles.sectionHeader} value='Albums' />
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
						<label style={styles.sectionHeader} value='Top Tracks' />
						<TrackList tracks={trackEntries} />
					</layout>
				)}

				{artist.bio && (
					<layout style={styles.section}>
						<label style={styles.sectionHeader} value='About' />
						<view onTap={() => this.setState({ showBioModal: true })} style={styles.bioContainer}>
							<label
								ellipsizeMode='tail'
								numberOfLines={3}
								style={styles.bioText}
								value={artist.bio}
							/>
						</view>
					</layout>
				)}
			</scroll>

			{showBioModal && (
				<view onTap={() => this.setState({ showBioModal: false })} style={styles.modalOverlay}>
					<view onTap={() => {}} style={styles.modalCard}>
						<label style={styles.modalTitle} value={artist.name} />
						<scroll style={styles.modalScroll}>
							<label numberOfLines={0} style={styles.modalBioText} value={artist.bio ?? ''} />
						</scroll>
					</view>
				</view>
			)}
		</layout>;
	}
}

const styles = {
	bioContainer: new Style({
		backgroundColor: theme.colors.bgAccent,
		borderRadius: theme.borderRadius,
		padding: 12,
	}),
	bioText: new Style<Label>({
		...theme.text.main,
		color: theme.colors.grey,
	}),
	modalBioText: new Style<Label>({
		...theme.text.main,
		color: theme.colors.grey,
	}),
	modalCard: new Style({
		backgroundColor: theme.colors.bgAccent,
		borderRadius: theme.borderRadius,
		maxHeight: '80%',
		padding: 20,
		width: '90%',
	}),
	modalOverlay: new Style({
		alignItems: 'center',
		backgroundColor: 'rgba(0,0,0,0.75)',
		bottom: 0,
		justifyContent: 'center',
		left: 0,
		position: 'absolute',
		right: 0,
		top: 0,
	}),
	modalScroll: new Style({
		flexGrow: 1,
		marginTop: 12,
	}),
	modalTitle: new Style<Label>({
		...theme.text.title,
	}),
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
	sectionHeader: new Style<Label>({
		...theme.text.title,
		marginBottom: 8,
		paddingLeft: 4,
	}),
};
