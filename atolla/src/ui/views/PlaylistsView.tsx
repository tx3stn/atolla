// @ts-nocheck
import { StatefulComponent } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { Playlist } from '../../models/Playlist';
import { theme } from '../../theme';
import type { Transport } from '../../transports/Transport';
import { type Card, CardGrid } from '../components/CardGrid';
import { type PlaylistSort, PlaylistSorts, sortPlaylists } from './PlaylistsSort';
import { PlaylistView } from './PlaylistView';

export interface PlaylistsViewModel {
	transport: Transport;
}

interface PlaylistsState {
	playlists: Array<Playlist>;
	selectedPlaylistId: string | null;
	sort: PlaylistSort;
}

export class PlaylistsView extends StatefulComponent<PlaylistsViewModel, PlaylistsState> {
	state: PlaylistsState = {
		playlists: [],
		selectedPlaylistId: null,
		sort: PlaylistSorts.alphabetical,
	};

	onCreate(): void {
		this.viewModel.transport.getAllPlaylists().then((playlists) => {
			this.setState({ playlists });
		});
	}

	onRender(): void {
		if (this.state.selectedPlaylistId) {
			<PlaylistView
				playlistId={this.state.selectedPlaylistId}
				transport={this.viewModel.transport}
			/>;
			return;
		}

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
				onCardTap={(card) => {
					this.setState({ selectedPlaylistId: card.id });
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
