// @ts-nocheck
import { StatefulComponent } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { Playlist } from '../../models/Playlist';
import type { Track } from '../../models/Track';
import { theme } from '../../theme';
import type { Transport } from '../../transports/Transport';
import { DetailHeader } from '../components/DetailHeader';
import { TrackList, type TrackListEntry } from '../components/TrackList';

export interface PlaylistViewModel {
	playlist: Playlist;
	transport: Transport;
}

interface PlaylistState {
	tracks: Array<Track>;
}

export class PlaylistView extends StatefulComponent<PlaylistViewModel, PlaylistState> {
	private hasBeenDestroyed = false;

	state: PlaylistState = {
		tracks: [],
	};

	onCreate(): void {
		this.hasBeenDestroyed = false;
		this.viewModel.transport.getTracksByPlaylist(this.viewModel.playlist.id).then((tracks) => {
			if (this.hasBeenDestroyed) {
				return;
			}
			this.setState({ tracks });
		});
	}

	onDestroy(): void {
		this.hasBeenDestroyed = true;
	}

	onRender(): void {
		const entries: Array<TrackListEntry> = this.state.tracks.map((track) => ({
			artworkSource: track.albumImageUrl ?? null,
			id: track.id,
			meta: track.artistName,
			title: track.name,
		}));

		const { tracks } = this.state;
		const totalDuration = tracks.reduce((sum, t) => sum + t.duration, 0);

		<scroll style={styles.root}>
			<DetailHeader
				artworkSource={this.viewModel.playlist.imageUrl ?? null}
				fallbackText={this.viewModel.playlist.name}
				subheaderLeft={tracks.length > 0 ? `${tracks.length} tracks` : null}
				subheaderRight={tracks.length > 0 ? formatDuration(totalDuration) : null}
			/>
			<TrackList tracks={entries} />
		</scroll>;
	}
}

function formatDuration(seconds: number): string {
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const s = seconds % 60;
	const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
	return h > 0 ? `${h}:${mm}:${String(s).padStart(2, '0')}` : `${mm}:${String(s).padStart(2, '0')}`;
}

const styles = {
	root: new Style({
		flexGrow: 1,
		padding: 8,
		paddingBottom: theme.scrollPaddingBottom,
		width: '100%',
	}),
};
