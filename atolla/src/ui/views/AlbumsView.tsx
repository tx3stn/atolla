// @ts-nocheck
import { StatefulComponent } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { Album } from '../../models/Album';
import type { PlaybackStore } from '../../stores/Playback';
import { theme } from '../../theme';
import type { Transport } from '../../transports/Transport';
import { type Card, CardGrid } from '../components/CardGrid';
import { type AlbumSort, AlbumSorts, sortAlbums } from './AlbumsSort';
import { AlbumView } from './AlbumView';

export interface AlbumsViewModel {
	playbackStore: PlaybackStore;
	transport: Transport;
}

interface AlbumsState {
	albums: Array<Album>;
	selectedAlbum: Album | null;
	sort: AlbumSort;
}

export class AlbumsView extends StatefulComponent<AlbumsViewModel, AlbumsState> {
	private isDestroyed = false;

	state: AlbumsState = {
		albums: [],
		selectedAlbum: null,
		sort: AlbumSorts.alphabetical,
	};

	onCreate(): void {
		this.isDestroyed = false;
		this.viewModel.transport.getAllAlbums().then((albums) => {
			if (this.isDestroyed) {
				return;
			}
			this.setState({ albums });
		});
	}

	onDestroy(): void {
		this.isDestroyed = true;
	}

	onRender(): void {
		if (this.state.selectedAlbum) {
			<AlbumView
				album={this.state.selectedAlbum}
				playbackStore={this.viewModel.playbackStore}
				transport={this.viewModel.transport}
			/>;
			return;
		}

		const cards: Array<Card> = sortAlbums(this.state.albums, this.state.sort).map((album) => ({
			artworkKey: album.imageUrl ?? '',
			id: album.id,
			kind: 'album',
			primaryText: album.name,
			secondaryText: album.artistName,
		}));

		<scroll style={styles.root}>
			<CardGrid
				accessibilityLabel='home-albums-grid'
				cards={cards}
				onCardTap={(card) => {
					const album = this.state.albums.find((a) => a.id === card.id) ?? null;
					this.setState({ selectedAlbum: album });
				}}
				resolveArtworkSource={(key) => key || null}
			/>
		</scroll>;
	}
}

const styles = {
	root: new Style({
		flexGrow: 1,
		padding: 8,
		paddingBottom: theme.scrollPaddingBottom,
		width: '100%',
	}),
};
