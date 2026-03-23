// @ts-nocheck
import { Style } from 'valdi_core/src/Style';
import { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';
import { DetachedSlotRenderer } from 'valdi_core/src/slot/DetachedSlotRenderer';
import { NavigationPage } from 'valdi_navigation/src/NavigationPage';
import { NavigationPageStatefulComponent } from 'valdi_navigation/src/NavigationPageComponent';
import type { Playlist } from '../../models/Playlist';
import type { Track } from '../../models/Track';
import type { ImageCache } from '../../services/ImageCache';
import { type PlaybackStore, shuffleArray } from '../../stores/Playback';
import { scrollPaddingBottom, theme } from '../../theme';
import type { Transport } from '../../transports/Transport';
import { DetailHeader } from '../components/DetailHeader';
import { TrackList, type TrackListEntry } from '../components/TrackList';

export interface PlaylistViewModel {
	imageCache: ImageCache;
	playbackStore: PlaybackStore;
	playlist: Playlist;
	transport: Transport;
}

interface PlaylistState {
	artistLogoUrls: Array<string | null>;
	isFooterVisible: boolean;
	tracks: Array<Track>;
}

@NavigationPage(module)
export class PlaylistView extends NavigationPageStatefulComponent<
	PlaylistViewModel,
	PlaylistState
> {
	private modalSlot = new DetachedSlot();
	private hasBeenDestroyed = false;
	private unsubscribePlayback?: () => void;

	state: PlaylistState = {
		artistLogoUrls: [],
		isFooterVisible: false,
		tracks: [],
	};

	handleHeaderPlayTap = (): void => {
		const { playbackStore } = this.viewModel;
		const { artistLogoUrls, tracks } = this.state;
		playbackStore.playWithArtistLogos(tracks, artistLogoUrls);
	};

	handleHeaderShuffleTap = (): void => {
		const { playbackStore } = this.viewModel;
		const { artistLogoUrls, tracks } = this.state;
		const indices = shuffleArray(tracks.map((_, i) => i));
		playbackStore.playWithArtistLogos(
			indices.map((i) => tracks[i]),
			indices.map((i) => artistLogoUrls[i] ?? null),
		);
	};

	onCreate(): void {
		this.hasBeenDestroyed = false;
		const { playbackStore, transport, playlist } = this.viewModel;
		this.unsubscribePlayback = playbackStore.subscribe(() => {
			this.setState({ isFooterVisible: playbackStore.track !== null });
		});
		this.setState({ isFooterVisible: playbackStore.track !== null });
		transport.getTracksByPlaylist(playlist.id).then(async (tracks) => {
			if (this.hasBeenDestroyed) {
				return;
			}
			const artistLogoUrls = await Promise.all(
				tracks.map((t) => (t.artistId ? transport.getArtistLogoUrl(t.artistId) : null)),
			);
			if (this.hasBeenDestroyed) {
				return;
			}
			this.setState({ artistLogoUrls, tracks });
		});
	}

	onDestroy(): void {
		this.hasBeenDestroyed = true;
		this.unsubscribePlayback?.();
	}

	onRender(): void {
		const { isFooterVisible, tracks } = this.state;

		const entries: Array<TrackListEntry> = tracks.map((track) => ({
			artworkSource: track.albumImageUrl ?? null,
			id: track.id,
			meta: track.artistName,
			title: track.name,
		}));

		const totalDuration = tracks.reduce((sum, t) => sum + t.duration, 0);

		<layout
			accessibilityLabel='playlist-view'
			contentDescription='playlist-view'
			style={styles.root}
		>
			<scroll style={createScrollStyle(isFooterVisible)}>
				<DetailHeader
					artworkCategory='playlist_image'
					artworkSource={this.viewModel.playlist.imageUrl ?? null}
					fallbackText={this.viewModel.playlist.name}
					imageCache={this.viewModel.imageCache}
					onPlay={tracks.length > 0 ? this.handleHeaderPlayTap : undefined}
					onShuffle={tracks.length > 0 ? this.handleHeaderShuffleTap : undefined}
					subheaderLineOneLeft={tracks.length > 0 ? `${tracks.length} tracks` : null}
					subheaderLineOneRight={tracks.length > 0 ? formatDuration(totalDuration) : null}
				/>
				<TrackList imageCache={this.viewModel.imageCache} tracks={entries} />
			</scroll>
			<DetachedSlotRenderer detachedSlot={this.modalSlot} />
		</layout>;
	}
}

const styles = {
	root: new Style({
		backgroundColor: theme.colors.bg,
		flexGrow: 1,
		width: '100%',
	}),
};

function formatDuration(seconds: number): string {
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const s = seconds % 60;
	const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
	return h > 0 ? `${h}:${mm}:${String(s).padStart(2, '0')}` : `${mm}:${String(s).padStart(2, '0')}`;
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
