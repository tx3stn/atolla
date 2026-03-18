// @ts-nocheck
import { StatefulComponent } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { Playlist } from '../../models/Playlist';
import { theme } from '../../theme';
import type { Transport } from '../../transports/Transport';
import { type Card, CardGrid } from '../components/CardGrid';
import { type PlaylistSort, PlaylistSorts, sortPlaylists } from './PlaylistsSort';

export interface PlaylistsViewModel {
	transport: Transport;
}

interface PlaylistsState {
	playlists: Array<Playlist>;
	sort: PlaylistSort;
}

export class PlaylistsView extends StatefulComponent<PlaylistsViewModel, PlaylistsState> {
	state: PlaylistsState = {
		playlists: [],
		sort: PlaylistSorts.alphabetical,
	};

	onCreate(): void {
		this.viewModel.transport.getAllPlaylists().then((playlists) => {
			this.setState({ playlists });
		});
	}

	onRender(): void {
		const cards: Array<Card> = sortPlaylists(this.state.playlists, this.state.sort).map(
			(playlist) => ({
				artworkKey: playlist.imageUrl ?? '',
				id: playlist.id,
				kind: 'playlist',
				primaryText: playlist.name,
				secondaryText: '',
			}),
		);

		<scroll style={styles.root}>
			<CardGrid
				accessibilityLabel='playlists-grid'
				cards={cards}
				onCardTap={() => {}}
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
