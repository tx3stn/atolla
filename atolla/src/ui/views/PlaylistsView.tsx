// @ts-nocheck
import { StatefulComponent } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { NavigationController } from 'valdi_navigation/src/NavigationController';
import type { Playlist } from '../../models/Playlist';
import type { PlaybackStore } from '../../stores/Playback';
import { scrollPaddingBottom, theme } from '../../theme';
import type { Transport } from '../../transports/Transport';
import { type Card, CardGrid } from '../components/CardGrid';
import { type PlaylistSort, PlaylistSorts, sortPlaylists } from './PlaylistsSort';
import { PlaylistView } from './PlaylistView';

export interface PlaylistsViewModel {
	navigationController: NavigationController;
	playbackStore: PlaybackStore;
	transport: Transport;
}

interface PlaylistsState {
	isFooterVisible: boolean;
	playlists: Array<Playlist>;
	sort: PlaylistSort;
}

export class PlaylistsView extends StatefulComponent<PlaylistsViewModel, PlaylistsState> {
	private hasBeenDestroyed = false;
	private unsubscribePlayback?: () => void;

	state: PlaylistsState = {
		isFooterVisible: false,
		playlists: [],
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
		const { navigationController, playbackStore, transport } = this.viewModel;

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
					const playlist = this.state.playlists.find((p) => p.id === card.id);
					if (playlist) {
						navigationController.push(PlaylistView, { playbackStore, playlist, transport }, {});
					}
				}}
				resolveArtworkSource={(key) => key || null}
			/>
		</scroll>;
	}
}

function createScrollStyle(isFooterVisible: boolean): Style {
	return new Style({
		backgroundColor: theme.colors.bg,
		flexGrow: 1,
		padding: 8,
		paddingBottom: scrollPaddingBottom(isFooterVisible),
		width: '100%',
	});
}
