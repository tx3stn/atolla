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
	selectedPlaylist: Playlist | null;
	sort: PlaylistSort;
}

export class PlaylistsView extends StatefulComponent<PlaylistsViewModel, PlaylistsState> {
	private isDestroyed = false;

	state: PlaylistsState = {
		playlists: [],
		selectedPlaylist: null,
		sort: PlaylistSorts.alphabetical,
	};

	onCreate(): void {
		this.isDestroyed = false;
		this.viewModel.transport.getAllPlaylists().then((playlists) => {
			if (this.isDestroyed) {
				return;
			}
			this.setState({ playlists });
		});
	}

	onDestroy(): void {
		this.isDestroyed = true;
	}

	onRender(): void {
		if (this.state.selectedPlaylist) {
			<PlaylistView playlist={this.state.selectedPlaylist} transport={this.viewModel.transport} />;
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
				accessibilityLabel='home-playlists-grid'
				cards={cards}
				onCardTap={(card) => {
					const playlist = this.state.playlists.find((p) => p.id === card.id) ?? null;
					this.setState({ selectedPlaylist: playlist });
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
