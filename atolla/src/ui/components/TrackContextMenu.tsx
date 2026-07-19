import res from 'atolla/res';
import { StatefulComponent } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { ImageView, View } from 'valdi_tsx/src/NativeTemplateElements';
import type { Track } from '../../models/Track';
import Strings from '../../Strings';
import type { ImageCache } from '../../services/ImageCache';
import type { PlaybackStore } from '../../stores/Playback';
import { theme } from '../../theme';
import type { Transport } from '../../transports/Transport';
import { ArtistLogo } from './ArtistLogo';
import { ContextMenuActionRow } from './ContextMenuActionRow';
import { ModalBase } from './ModalBase';
import { TrackList, type TrackListEntry } from './TrackList';

export interface TrackContextMenuViewModel {
	animationsEnabled: boolean;
	imageCache?: ImageCache;
	onAddToPlaylist?: () => void;
	onAlbumTap?: () => void;
	onArtistTap?: () => void;
	onCreatePlaylist?: () => void;
	onDismiss: (toastMessage?: string) => void;
	playbackStore: PlaybackStore;
	track: Track;
	transport: Transport;
}

interface TrackContextMenuState {
	artistLogoUrl: string | null;
}

export class TrackContextMenu extends StatefulComponent<
	TrackContextMenuViewModel,
	TrackContextMenuState
> {
	state: TrackContextMenuState = {
		artistLogoUrl: null,
	};

	private cachedPreviewEntry: Array<TrackListEntry> = [];
	private cachedPreviewEntrySource: Track | null = null;

	onCreate(): void {
		const { track, transport } = this.viewModel;
		if (track.artistId) {
			transport.getArtistLogoUrl(track.artistId).then((artistLogoUrl) => {
				if (!this.isDestroyed()) {
					this.setState({ artistLogoUrl });
				}
			});
		}
	}

	private getPreviewEntry(track: Track): Array<TrackListEntry> {
		if (track !== this.cachedPreviewEntrySource) {
			this.cachedPreviewEntrySource = track;
			this.cachedPreviewEntry = [
				{
					artworkSource: track.albumImageUrl ?? null,
					id: track.id,
					meta: track.artistName ?? track.albumName ?? '',
					title: track.name,
				},
			];
		}

		return this.cachedPreviewEntry;
	}

	handlePlayNext = (): void => {
		const { playbackStore, track } = this.viewModel;
		playbackStore.playNext([track]);
		this.viewModel.onDismiss(Strings.playingNextToast());
	};

	handleAddToQueue = (): void => {
		this.viewModel.playbackStore.addToQueue([this.viewModel.track]);
		this.viewModel.onDismiss(Strings.addedToQueueToast());
	};

	handleAddToPlaylist = (): void => {
		this.viewModel.onAddToPlaylist?.();
	};

	handleCreatePlaylist = (): void => {
		this.viewModel.onCreatePlaylist?.();
	};

	handleBackdropTap = (): void => {
		this.viewModel.onDismiss();
	};

	handleAlbumTap = (_trackId: string): void => {
		if (this.viewModel.onAlbumTap) {
			this.viewModel.onAlbumTap();
			this.viewModel.onDismiss();
		}
	};

	handleArtistTap = (): void => {
		if (this.viewModel.onArtistTap) {
			this.viewModel.onArtistTap();
		}
		this.viewModel.onDismiss();
	};

	onRender(): void {
		const { animationsEnabled, imageCache, onCreatePlaylist, track } = this.viewModel;
		const { artistLogoUrl } = this.state;

		const previewEntry = this.getPreviewEntry(track);

		<ModalBase
			accessibilityId='track-context-menu'
			backdropAccessibilityId='track-context-backdrop'
			cardStyle={styles.card}
			onDismiss={this.handleBackdropTap}
		>
			<ArtistLogo
				accessibilityId='track-context-artist-logo'
				containerStyle={styles.logoContainer}
				fallbackText={track.artistName ?? null}
				logoSource={artistLogoUrl}
				logoStyle={styles.logoImage}
				onTap={this.handleArtistTap}
			/>
			<view accessibilityId='track-context-track' accessibilityLabel='track-context-track'>
				<TrackList
					imageCache={imageCache}
					onTrackTap={this.viewModel.onAlbumTap ? this.handleAlbumTap : undefined}
					tracks={previewEntry}
				/>
			</view>
			<view style={styles.divider} />
			<ContextMenuActionRow
				accessibilityId='track-context-play-next'
				animationsEnabled={animationsEnabled}
				icon={res.playnext}
				label={Strings.playNext()}
				onPress={this.handlePlayNext}
			/>
			<ContextMenuActionRow
				accessibilityId='track-context-add-to-queue'
				animationsEnabled={animationsEnabled}
				icon={res.addtoqueue}
				label={Strings.addToQueue()}
				onPress={this.handleAddToQueue}
			/>
			<ContextMenuActionRow
				accessibilityId='track-context-add-to-playlist'
				animationsEnabled={animationsEnabled}
				icon={res.addtoplaylist}
				label={Strings.addToPlaylist()}
				onPress={this.handleAddToPlaylist}
			/>
			{onCreatePlaylist && (
				<ContextMenuActionRow
					accessibilityId='track-context-create-playlist'
					animationsEnabled={animationsEnabled}
					icon={res.createnewplaylist}
					label={Strings.createNewPlaylist()}
					onPress={this.handleCreatePlaylist}
				/>
			)}
		</ModalBase>;
	}
}

const styles = {
	card: new Style<View>({
		backgroundColor: theme.colors.bg,
		borderColor: theme.colors.separator,
		borderRadius: theme.radius.default,
		borderWidth: 1,
		padding: 16,
		slowClipping: true,
		width: '90%',
	}),
	divider: new Style<View>({
		backgroundColor: theme.colors.separator,
		height: 1,
		marginBottom: 8,
		marginTop: 8,
		width: '100%',
	}),
	logoContainer: new Style<View>({
		alignItems: 'center' as const,
		height: 60,
		marginBottom: 12,
		slowClipping: true,
		width: '100%',
	}),
	logoImage: new Style<ImageView>({
		height: '100%',
		objectFit: 'contain' as const,
		width: '100%',
	}),
};
