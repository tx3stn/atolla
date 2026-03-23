// @ts-nocheck
import { Style } from 'valdi_core/src/Style';
import { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';
import { DetachedSlotRenderer } from 'valdi_core/src/slot/DetachedSlotRenderer';
import { NavigationPage } from 'valdi_navigation/src/NavigationPage';
import { NavigationPageStatefulComponent } from 'valdi_navigation/src/NavigationPageComponent';
import type { Album } from '../../models/Album';
import type { Track } from '../../models/Track';
import type { ImageCache } from '../../services/ImageCache';
import { type PlaybackStore, shuffleArray } from '../../stores/Playback';
import { scrollPaddingBottom, theme } from '../../theme';
import type { Transport } from '../../transports/Transport';
import { BioSection } from '../components/BioSection';
import { DetailHeader } from '../components/DetailHeader';
import { TrackList, type TrackListEntry } from '../components/TrackList';

export interface AlbumViewModel {
	album: Album;
	imageCache: ImageCache;
	playbackStore: PlaybackStore;
	transport: Transport;
}

interface AlbumState {
	artistLogoUrl: string | null;
	isFooterVisible: boolean;
	tracks: Array<Track>;
}

@NavigationPage(module)
export class AlbumView extends NavigationPageStatefulComponent<AlbumViewModel, AlbumState> {
	private modalSlot = new DetachedSlot();
	private hasBeenDestroyed = false;
	private unsubscribePlayback?: () => void;

	state: AlbumState = {
		artistLogoUrl: null,
		isFooterVisible: false,
		tracks: [],
	};

	handleHeaderPlayTap = (): void => {
		if (this.state.tracks.length === 0) return;
		const { album, playbackStore } = this.viewModel;
		playbackStore.play(this.state.tracks, album);
		playbackStore.setArtistLogoUrl(this.state.artistLogoUrl);
	};

	handleHeaderShuffleTap = (): void => {
		if (this.state.tracks.length === 0) return;
		const { album, playbackStore } = this.viewModel;
		playbackStore.play(shuffleArray(this.state.tracks), album);
		playbackStore.setArtistLogoUrl(this.state.artistLogoUrl);
	};

	onCreate(): void {
		this.hasBeenDestroyed = false;
		const { album, playbackStore, transport } = this.viewModel;
		this.unsubscribePlayback = playbackStore.subscribe(() => {
			this.setState({ isFooterVisible: playbackStore.track !== null });
		});
		this.setState({ isFooterVisible: playbackStore.track !== null });
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
		this.unsubscribePlayback?.();
	}

	onRender(): void {
		const { artistLogoUrl, isFooterVisible, tracks } = this.state;
		const { album, imageCache } = this.viewModel;

		const entries: Array<TrackListEntry> = tracks.map((track) => ({
			id: track.id,
			leadingLabel: track.trackNumber != null ? String(track.trackNumber) : null,
			meta: formatDuration(track.duration),
			title: track.name,
		}));

		const totalDuration = tracks.reduce((sum, t) => sum + t.duration, 0);
		const releaseDateText = album.releaseDate ?? null;
		const durationText = tracks.length > 0 ? formatDuration(totalDuration) : null;

		const scrollStyle = createScrollStyle(isFooterVisible);

		<layout accessibilityLabel='album-view' contentDescription='album-view' style={styles.root}>
			<scroll style={scrollStyle}>
				<DetailHeader
					artworkCategory='album_art'
					artworkSource={album.imageUrl ?? null}
					buttonText={album.releaseDate}
					fallbackText={album.artistName}
					imageCache={imageCache}
					logoSource={artistLogoUrl}
					onPlay={tracks.length > 0 ? this.handleHeaderPlayTap : undefined}
					onShuffle={tracks.length > 0 ? this.handleHeaderShuffleTap : undefined}
					subheaderLineOneLeft={album.name}
					subheaderLineTwoLeft={releaseDateText}
					subheaderLineTwoRight={durationText}
				/>
				<TrackList imageCache={imageCache} tracks={entries} />
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
		backgroundColor: theme.colors.bg,
		flexGrow: 1,
		width: '100%',
	}),
};

function createScrollStyle(isFooterVisible: boolean): Style {
	return new Style({
		backgroundColor: theme.colors.bg,
		flexGrow: 1,
		padding: 8,
		paddingBottom: scrollPaddingBottom(isFooterVisible),
		width: '100%',
	});
}
