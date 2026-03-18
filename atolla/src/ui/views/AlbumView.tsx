// @ts-nocheck
import { StatefulComponent } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { Album } from '../../models/Album';
import type { Track } from '../../models/Track';
import { theme } from '../../theme';
import type { Transport } from '../../transports/Transport';
import { DetailHeader } from '../components/DetailHeader';
import { TrackList, type TrackListEntry } from '../components/TrackList';

export interface AlbumViewModel {
	album: Album;
	transport: Transport;
}

interface AlbumState {
	tracks: Array<Track>;
}

export class AlbumView extends StatefulComponent<AlbumViewModel, AlbumState> {
	state: AlbumState = {
		tracks: [],
	};

	onCreate(): void {
		this.viewModel.transport.getTracksByAlbum(this.viewModel.album.id).then((tracks) => {
			this.setState({ tracks });
		});
	}

	onRender(): void {
		const entries: Array<TrackListEntry> = this.state.tracks.map((track) => ({
			id: track.id,
			leadingLabel: track.trackNumber != null ? String(track.trackNumber) : null,
			meta: formatDuration(track.duration),
			title: track.name,
		}));

		const totalDuration = this.state.tracks.reduce((sum, t) => sum + t.duration, 0);

		<scroll style={styles.root}>
			<DetailHeader
				artworkSource={this.viewModel.album.imageUrl ?? null}
				fallbackText={this.viewModel.album.artistName}
				subheaderLeft={this.viewModel.album.name}
				subheaderRight={this.state.tracks.length > 0 ? formatDuration(totalDuration) : null}
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
