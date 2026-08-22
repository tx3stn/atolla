import res from 'atolla_app/res';
import type { Track } from 'atolla_core/src/models/Track';
import Strings from 'atolla_core/src/Strings';
import type { ImageCache } from 'atolla_core/src/services/ImageCache';
import { INSTANT_MIX_LIMIT, type Transport } from 'atolla_core/src/transports/Transport';
import type { PlaybackStore } from 'atolla_player/src/stores/Playback';
import { StatefulComponent } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { ImageView, View } from 'valdi_tsx/src/NativeTemplateElements';
import { type ToastService, ToastTypes } from '../../services/ToastService';
import { theme } from '../../theme';
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
	onDismiss: () => void;
	onLyrics: () => void;
	playbackStore: PlaybackStore;
	toastService: ToastService;
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
		this.viewModel.playbackStore.playNext([this.viewModel.track]);
		this.viewModel.toastService.show({
			message: Strings.playingNextToast(),
			variant: ToastTypes.success,
		});
		this.viewModel.onDismiss();
	};

	handleInstantMix = (): void => {
		const reportFailure = (): void => {
			this.viewModel.toastService.show({
				message: Strings.instantMixFailedToast(),
				variant: ToastTypes.error,
			});
		};

		this.viewModel.transport
			.getInstantMix({ id: this.viewModel.track.id, kind: 'track' }, INSTANT_MIX_LIMIT)
			.then((mix) => {
				if (mix.length === 0) {
					reportFailure();
					return;
				}

				this.viewModel.playbackStore.playTracks(mix, 0);
			}, reportFailure);

		this.viewModel.onDismiss();
	};

	handleAddToQueue = (): void => {
		this.viewModel.playbackStore.addToQueue([this.viewModel.track]);
		this.viewModel.toastService.show({
			message: Strings.addedToQueueToast(),
			variant: ToastTypes.success,
		});
		this.viewModel.onDismiss();
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

	handleLyrics = (): void => {
		this.viewModel.onLyrics();
	};

	handleLyricsUnavailable = (): void => {
		this.viewModel.toastService.show({
			message: Strings.lyricsEmpty(),
			variant: ToastTypes.error,
		});
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
				accessibilityId='track-context-instant-mix'
				animationsEnabled={animationsEnabled}
				icon={res.instantmix}
				label={Strings.instantMix()}
				onPress={this.handleInstantMix}
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
			<ContextMenuActionRow
				accessibilityId='track-context-lyrics'
				animationsEnabled={animationsEnabled}
				disabled={track.hasLyrics === false}
				icon={res.lyrics}
				label={Strings.lyrics()}
				onDisabledPress={this.handleLyricsUnavailable}
				onPress={this.handleLyrics}
			/>
		</ModalBase>;
	}
}

const styles = {
	card: new Style<View>({
		backgroundColor: theme.colors.bg,
		borderColor: theme.colors.separator,
		borderRadius: theme.radius.default,
		borderWidth: 1,
		padding: theme.scale(16),
		slowClipping: true,
		width: '90%',
	}),
	divider: new Style<View>({
		backgroundColor: theme.colors.separator,
		height: 1,
		marginBottom: theme.scale(8),
		marginTop: theme.scale(8),
		width: '100%',
	}),
	logoContainer: new Style<View>({
		alignItems: 'center' as const,
		height: theme.scale(60),
		marginBottom: theme.scale(12),
		slowClipping: true,
		width: '100%',
	}),
	logoImage: new Style<ImageView>({
		height: '100%',
		objectFit: 'contain' as const,
		width: '100%',
	}),
};
