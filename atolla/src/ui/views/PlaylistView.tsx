// @ts-nocheck
import { StatefulComponent } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { Track } from '../../models/Track';
import { theme } from '../../theme';
import type { Transport } from '../../transports/Transport';
import { TrackList, type TrackListEntry } from '../components/TrackList';

export interface PlaylistViewModel {
	playlistId: string;
	transport: Transport;
}

interface PlaylistState {
	tracks: Array<Track>;
}

export class PlaylistView extends StatefulComponent<PlaylistViewModel, PlaylistState> {
	state: PlaylistState = {
		tracks: [],
	};

	onCreate(): void {
		this.viewModel.transport.getTracksByPlaylist(this.viewModel.playlistId).then((tracks) => {
			this.setState({ tracks });
		});
	}

	onRender(): void {
		const entries: Array<TrackListEntry> = this.state.tracks.map((track) => ({
			artworkSource: track.albumImageUrl ?? null,
			id: track.id,
			meta: [track.artistName, track.albumName].filter(Boolean).join(' — '),
			title: track.name,
		}));

		<scroll style={styles.root}>
			<TrackList tracks={entries} />
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
