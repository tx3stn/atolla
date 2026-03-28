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
import { Toast } from '../components/Toast';
import { TrackContextMenu } from '../components/TrackContextMenu';
import { TrackList, type TrackListEntry } from '../components/TrackList';

export interface PlaylistViewModel {
	imageCache: ImageCache;
	onExitFromSearchNavigation?: () => void;
	onNavigateToArtist?: (artistId: string) => void;
	playbackStore: PlaybackStore;
	playlist: Playlist;
	transport: Transport;
}

interface PlaylistState {
	artistLogoUrls: Array<string | null>;
	contextMenuTrack: Track | null;
	isFooterVisible: boolean;
	toastMessage: string | null;
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
		contextMenuTrack: null,
		isFooterVisible: false,
		toastMessage: null,
		tracks: [],
	};

	navigateToArtist = (artistId: string): void => {
		const { imageCache, playbackStore, transport } = this.viewModel;
		transport.getArtist(artistId).then((artist) => {
			if (!artist) return;
			this.navigationController.push(
				ArtistView,
				{ animationsEnabled: this.animationsEnabled, artist, imageCache, playbackStore, transport },
				{},
				{ animated: this.animationsEnabled },
			);
		});
	};

	handleTrackLongPress = (track: Track): void => {
		this.setState({ contextMenuTrack: track });
	};

	handleContextMenuDismiss = (toastMessage?: string): void => {
		this.setState({ contextMenuTrack: null });
		if (toastMessage) {
			this.setState({ toastMessage });
			setTimeout(() => {
				this.setState({ toastMessage: null });
			}, 2000);
		}
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

	handleHeaderAddToQueueTap = (): void => {
		this.viewModel.playbackStore.addToQueue(this.state.tracks);
	};

	handleTrackTap = (trackId: string): void => {
		const { playbackStore } = this.viewModel;
		const { artistLogoUrls, tracks } = this.state;
		const trackIndex = this.state.tracks.findIndex((track) => track.id === trackId);
		if (trackIndex < 0) {
			return;
		}

		playbackStore.playWithArtistLogos(tracks, artistLogoUrls, trackIndex);
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
		this.viewModel.onExitFromSearchNavigation?.();
	}

	onRender(): void {
		const { contextMenuTrack, isFooterVisible, toastMessage, tracks } = this.state;
		const { imageCache, onNavigateToArtist, playbackStore, transport } = this.viewModel;

		const entries: Array<TrackListEntry> = tracks.map((track) => ({
			artworkSource: track.albumImageUrl ?? null,
			id: track.id,
			meta: track.artistName,
			title: track.name,
			track,
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
					onAddToQueue={tracks.length > 0 ? this.handleHeaderAddToQueueTap : undefined}
					onPlay={tracks.length > 0 ? this.handleHeaderPlayTap : undefined}
					onShuffle={tracks.length > 0 ? this.handleHeaderShuffleTap : undefined}
					subheaderLineOneLeft={tracks.length > 0 ? `${tracks.length} tracks` : null}
					subheaderLineOneRight={tracks.length > 0 ? formatDuration(totalDuration) : null}
				/>
				<TrackList
					imageCache={imageCache}
					onTrackLongPress={this.handleTrackLongPress}
					onTrackTap={this.handleTrackTap}
					tracks={entries}
				/>
			</scroll>
			{contextMenuTrack && (
				<TrackContextMenu
					imageCache={imageCache}
					onArtistTap={
						onNavigateToArtist && contextMenuTrack.artistId
							? (
									(id) => () =>
										onNavigateToArtist(id)
								)(contextMenuTrack.artistId)
							: undefined
					}
					onDismiss={this.handleContextMenuDismiss}
					playbackStore={playbackStore}
					track={contextMenuTrack}
					transport={transport}
				/>
			)}
			{toastMessage && <Toast message={toastMessage} />}
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
