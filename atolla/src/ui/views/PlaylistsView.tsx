// @ts-nocheck
import { StatefulComponent } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { Playlist } from '../../models/Playlist';
import type { PlaybackStore } from '../../stores/Playback';
import { scrollPaddingBottom } from '../../theme';
import type { Transport } from '../../transports/Transport';
import { type Card, CardGrid } from '../components/CardGrid';
import { type PlaylistSort, PlaylistSorts, sortPlaylists } from './PlaylistsSort';
import { PlaylistView } from './PlaylistView';

export interface PlaylistsViewModel {
	playbackStore: PlaybackStore;
	transport: Transport;
}

interface PlaylistsState {
	isFooterVisible: boolean;
	playlists: Array<Playlist>;
	selectedPlaylist: Playlist | null;
	sort: PlaylistSort;
}

export class PlaylistsView extends StatefulComponent<PlaylistsViewModel, PlaylistsState> {
	private hasBeenDestroyed = false;
	private unsubscribePlayback?: () => void;

	state: PlaylistsState = {
		isFooterVisible: false,
		playlists: [],
		selectedPlaylist: null,
		sort: PlaylistSorts.alphabetical,
	};

	onCreate(): void {
		this.hasBeenDestroyed = false;
		this.unsubscribePlayback = this.viewModel.playbackStore.subscribe(() => {
			this.setState({ isFooterVisible: this.viewModel.playbackStore.track !== null });
		});
		this.setState({ isFooterVisible: this.viewModel.playbackStore.track !== null });
		this.viewModel.transport.getAllPlaylists().then((playlists) => {
			if (this.hasBeenDestroyed) {
				return;
			}
			this.setState({ playlists });
		});
	}

	onDestroy(): void {
		this.hasBeenDestroyed = true;
		this.unsubscribePlayback?.();
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

		<scroll style={createScrollStyle(this.state.isFooterVisible)}>
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

function createScrollStyle(isFooterVisible: boolean): Style {
	return new Style({
		flexGrow: 1,
		padding: 8,
		paddingBottom: scrollPaddingBottom(isFooterVisible),
		width: '100%',
	});
}
