// @ts-nocheck
import { Style } from 'valdi_core/src/Style';
import { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';
import { DetachedSlotRenderer } from 'valdi_core/src/slot/DetachedSlotRenderer';
import { NavigationPage } from 'valdi_navigation/src/NavigationPage';
import { NavigationPageStatefulComponent } from 'valdi_navigation/src/NavigationPageComponent';
import type { Album } from '../../models/Album';
import type { Artist } from '../../models/Artist';
import type { Track } from '../../models/Track';
import type { ImageCache } from '../../services/ImageCache';
import { type PlaybackStore, shuffleArray } from '../../stores/Playback';
import { scrollPaddingBottom, theme } from '../../theme';
import type { Transport } from '../../transports/Transport';
import { BioSection } from '../components/BioSection';
import { DetailHeader } from '../components/DetailHeader';
import { TrackContextMenu } from '../components/TrackContextMenu';
import { TrackList, type TrackListEntry } from '../components/TrackList';
import { ArtistView } from './ArtistView';

export interface AlbumViewModel {
	album: Album;
	animationsEnabled: boolean;
	imageCache: ImageCache;
	onExitFromSearchNavigation?: () => void;
	playbackStore: PlaybackStore;
	transport: Transport;
}

interface AlbumState {
	artist: Artist | null;
	artistLogoUrl: string | null;
	contextMenuTrack: Track | null;
	isFooterVisible: boolean;
	tracks: Array<Track>;
}

@NavigationPage(module)
export class AlbumView extends NavigationPageStatefulComponent<AlbumViewModel, AlbumState> {
	private modalSlot = new DetachedSlot();
	private hasBeenDestroyed = false;
	private unsubscribePlayback?: () => void;

	state: AlbumState = {
		artist: null,
		artistLogoUrl: null,
		contextMenuTrack: null,
		isFooterVisible: false,
		tracks: [],
	};

	handleArtistLogoTap = (): void => {
		const { album, animationsEnabled, imageCache, playbackStore, transport } = this.viewModel;
		const navigationController = this.viewModel.navigationController ?? this.navigationController;
		const pushArtistView = (artist: Artist) => {
			navigationController.push(
				ArtistView,
				{ animationsEnabled, artist, imageCache, playbackStore, transport },
				{},
				{ animated: animationsEnabled },
			);
		};

		if (this.state.artist) {
			pushArtistView(this.state.artist);
			return;
		}

		transport.getArtist(album.artistId).then((artist) => {
			const resolvedArtist =
				artist ??
				({
					id: album.artistId,
					logoUrl: this.state.artistLogoUrl ?? null,
					name: album.artistName,
				} as Artist);
			this.setState({ artist: resolvedArtist, artistLogoUrl: resolvedArtist.logoUrl ?? null });
			pushArtistView(resolvedArtist);
		});
	};

	handleTrackTap = (trackId: string): void => {
		if (this.state.tracks.length === 0) return;

		const trackIndex = this.state.tracks.findIndex((track) => track.id === trackId);
		if (trackIndex < 0) {
			return;
		}

		const { album, playbackStore } = this.viewModel;
		playbackStore.play(this.state.tracks, album, trackIndex);
		playbackStore.setArtistLogoUrl(this.state.artistLogoUrl);
	};

	handleHeaderPlayTap = (): void => {
		if (this.state.tracks.length === 0) return;
		const { album, playbackStore } = this.viewModel;
		playbackStore.play(this.state.tracks, album);
		playbackStore.setArtistLogoUrl(this.state.artistLogoUrl);
	};

	handleTrackLongPress = (track: Track): void => {
		this.setState({ contextMenuTrack: track });
	};

	handleContextMenuDismiss = (): void => {
		this.setState({ contextMenuTrack: null });
	};

	handleHeaderShuffleTap = (): void => {
		if (this.state.tracks.length === 0) return;
		const { album, playbackStore } = this.viewModel;
		playbackStore.play(shuffleArray(this.state.tracks), album);
		playbackStore.setArtistLogoUrl(this.state.artistLogoUrl);
	};

	handleHeaderAddToQueueTap = (): Promise<void> => {
		if (this.state.tracks.length === 0) return Promise.resolve();
		this.viewModel.playbackStore.addToQueue(this.state.tracks);
		return Promise.resolve();
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
			this.setState({ artist: artist ?? null, artistLogoUrl: logoUrl });
		});
	}

	onDestroy(): void {
		this.hasBeenDestroyed = true;
		this.unsubscribePlayback?.();
		this.viewModel.onExitFromSearchNavigation?.();
	}

	onRender(): void {
		const { artistLogoUrl, contextMenuTrack, isFooterVisible, tracks } = this.state;
		const { album, animationsEnabled, imageCache, playbackStore, transport } = this.viewModel;

		const entries: Array<TrackListEntry> = tracks.map((track) => ({
			id: track.id,
			leadingLabel: track.trackNumber != null ? String(track.trackNumber) : null,
			meta: formatDuration(track.duration),
			title: track.name,
			track,
		}));

		const totalDuration = tracks.reduce((sum, t) => sum + t.duration, 0);
		const releaseDateText = album.releaseDate ?? null;
		const durationText = tracks.length > 0 ? formatDuration(totalDuration) : null;

		const scrollStyle = createScrollStyle(isFooterVisible);

		<layout accessibilityLabel='album-view' contentDescription='album-view' style={styles.root}>
			<scroll style={scrollStyle}>
				<DetailHeader
					animationsEnabled={animationsEnabled}
					artworkCategory='album_art'
					artworkSource={album.imageUrl ?? null}
					buttonText={album.releaseDate}
					fallbackText={album.artistName}
					imageCache={imageCache}
					logoSource={artistLogoUrl}
					onAddToQueue={tracks.length > 0 ? this.handleHeaderAddToQueueTap : undefined}
					onArtistTap={this.handleArtistLogoTap}
					onPlay={tracks.length > 0 ? this.handleHeaderPlayTap : undefined}
					onShuffle={tracks.length > 0 ? this.handleHeaderShuffleTap : undefined}
					subheaderLineOneLeft={album.name}
					subheaderLineTwoLeft={releaseDateText}
					subheaderLineTwoRight={durationText}
				/>
				<TrackList
					imageCache={imageCache}
					onTrackLongPress={this.handleTrackLongPress}
					onTrackTap={this.handleTrackTap}
					tracks={entries}
				/>
				{album.bio && <BioSection bio={album.bio} modalSlot={this.modalSlot} title={album.name} />}
			</scroll>
			{contextMenuTrack && (
				<TrackContextMenu
					animationsEnabled={animationsEnabled}
					imageCache={imageCache}
					onArtistTap={this.handleArtistLogoTap}
					onDismiss={this.handleContextMenuDismiss}
					playbackStore={playbackStore}
					track={contextMenuTrack}
					transport={transport}
				/>
			)}
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
	return isFooterVisible ? scrollStyles.withFooter : scrollStyles.withoutFooter;
}

const scrollStyles = {
	withFooter: new Style({
		backgroundColor: theme.colors.bg,
		flexGrow: 1,
		padding: 8,
		paddingBottom: scrollPaddingBottom(true),
		width: '100%',
	}),
	withoutFooter: new Style({
		backgroundColor: theme.colors.bg,
		flexGrow: 1,
		padding: 8,
		paddingBottom: scrollPaddingBottom(false),
		width: '100%',
	}),
};
