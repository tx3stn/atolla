// @ts-nocheck
import { StatefulComponent } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';
import { DetachedSlotRenderer } from 'valdi_core/src/slot/DetachedSlotRenderer';
import type { Album } from '../../models/Album';
import type { Track } from '../../models/Track';
import type { PlaybackStore } from '../../stores/Playback';
import { theme } from '../../theme';
import type { Transport } from '../../transports/Transport';
import { BioSection } from '../components/BioSection';
import { DetailHeader } from '../components/DetailHeader';
import { TrackList, type TrackListEntry } from '../components/TrackList';

export interface AlbumViewModel {
	album: Album;
	playbackStore: PlaybackStore;
	transport: Transport;
}

interface AlbumState {
	artistLogoUrl: string | null;
	tracks: Array<Track>;
}

export class AlbumView extends StatefulComponent<AlbumViewModel, AlbumState> {
	private modalSlot = new DetachedSlot();
	private hasBeenDestroyed = false;

	state: AlbumState = {
		artistLogoUrl: null,
		tracks: [],
	};

	handleHeaderPlayTap = (): void => {
		if (this.state.tracks.length === 0) {
			return;
		}

		const { album, playbackStore } = this.viewModel;
		playbackStore.play(this.state.tracks, album);
		playbackStore.setArtistLogoUrl(this.state.artistLogoUrl);
	};

	onCreate(): void {
		this.hasBeenDestroyed = false;
		const { album, transport } = this.viewModel;
		transport.getTracksByAlbum(album.id).then((tracks) => {
			if (this.hasBeenDestroyed) {
				return;
			}
			this.setState({ tracks });
		});
		transport.getArtist(album.artistId).then((artist) => {
			if (this.hasBeenDestroyed) {
				return;
			}
			const logoUrl = artist?.logoUrl || null;
			this.setState({ artistLogoUrl: logoUrl });
		});
	}

	onDestroy(): void {
		this.hasBeenDestroyed = true;
	}

	onRender(): void {
		const { artistLogoUrl, tracks } = this.state;
		const { album } = this.viewModel;

		const entries: Array<TrackListEntry> = tracks.map((track) => ({
			id: track.id,
			leadingLabel: track.trackNumber != null ? String(track.trackNumber) : null,
			meta: formatDuration(track.duration),
			title: track.name,
		}));

		const totalDuration = tracks.reduce((sum, t) => sum + t.duration, 0);

		<layout style={styles.root}>
			<scroll style={styles.scroll}>
				<DetailHeader
					artworkSource={album.imageUrl ?? null}
					buttonText={album.releaseDate}
					fallbackText={album.artistName}
					logoSource={artistLogoUrl}
					onPlay={this.handleHeaderPlayTap}
					subheaderLeft={album.name}
					subheaderRight={tracks.length > 0 ? formatDuration(totalDuration) : null}
				/>
				<TrackList tracks={entries} />
				{album.bio && <BioSection bio={album.bio} modalSlot={this.modalSlot} title={album.name} />}
			</scroll>
			<DetachedSlotRenderer detachedSlot={this.modalSlot} />
		</layout>;
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
		width: '100%',
	}),
	scroll: new Style({
		flexGrow: 1,
		padding: 8,
		paddingBottom: theme.scrollPaddingBottom,
		width: '100%',
	}),
};
