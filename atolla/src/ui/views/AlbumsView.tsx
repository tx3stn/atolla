// @ts-nocheck
import { StatefulComponent } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { Album } from '../../models/Album';
import { theme } from '../../theme';
import type { Transport } from '../../transports/Transport';
import { type Card, CardGrid } from '../components/CardGrid';
import { type AlbumSort, AlbumSorts, sortAlbums } from './AlbumsSort';
import { AlbumView } from './AlbumView';

export interface AlbumsViewModel {
	transport: Transport;
}

interface AlbumsState {
	albums: Array<Album>;
	selectedAlbumId: string | null;
	sort: AlbumSort;
}

export class AlbumsView extends StatefulComponent<AlbumsViewModel, AlbumsState> {
	state: AlbumsState = {
		albums: [],
		selectedAlbumId: null,
		sort: AlbumSorts.alphabetical,
	};

	onCreate(): void {
		this.viewModel.transport.getAllAlbums().then((albums) => {
			this.setState({ albums });
		});
	}

	onRender(): void {
		if (this.state.selectedAlbumId) {
			<AlbumView albumId={this.state.selectedAlbumId} transport={this.viewModel.transport} />;
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
					this.setState({ selectedAlbumId: card.id });
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
