// @ts-nocheck
import res from 'atolla/res';
import { StatefulComponent } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { BlurView, ImageView, Label } from 'valdi_tsx/src/NativeTemplateElements';
import type { Track } from '../../models/Track';
import type { ImageCache } from '../../services/ImageCache';
import type { PlaybackStore } from '../../stores/Playback';
import { theme } from '../../theme';
import type { Transport } from '../../transports/Transport';
import { ArtistLogo } from './ArtistLogo';
import { TrackList } from './TrackList';

export interface TrackContextMenuViewModel {
	imageCache?: ImageCache;
	onArtistTap?: () => void;
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
	private hasBeenDestroyed = false;

	state: TrackContextMenuState = {
		artistLogoUrl: null,
	};

	onCreate(): void {
		this.hasBeenDestroyed = false;
		const { track, transport } = this.viewModel;
		if (track.artistId) {
			transport.getArtistLogoUrl(track.artistId).then((artistLogoUrl) => {
				if (!this.hasBeenDestroyed) {
					this.setState({ artistLogoUrl });
				}
			});
		}
	}

	onDestroy(): void {
		this.hasBeenDestroyed = true;
	}

	handlePlayNext = (): void => {
		this.viewModel.playbackStore.playNext([this.viewModel.track]);
		this.viewModel.onDismiss('playing next');
	};

	handleAddToQueue = (): void => {
		this.viewModel.playbackStore.addToQueue([this.viewModel.track]);
		this.viewModel.onDismiss('added to queue');
	};

	handleAddToPlaylist = (): void => {
		this.viewModel.onDismiss();
	};

	handleBackdropTap = (): void => {
		this.viewModel.onDismiss();
	};

	handleCardTap = (): void => {};

	handleArtistTap = (): void => {
		if (this.viewModel.onArtistTap) {
			this.viewModel.onArtistTap();
		}
		this.viewModel.onDismiss();
	};

	onRender(): void {
		const { imageCache, track } = this.viewModel;
		const { artistLogoUrl } = this.state;

		const previewEntry = [
			{
				artworkSource: track.albumImageUrl ?? null,
				id: track.id,
				meta: track.artistName ?? track.albumName ?? '',
				title: track.name,
			},
		];

		<blur
			blurStyle='systemThickMaterialDark'
			onTap={this.handleBackdropTap}
			style={styles.backdrop}
		>
			<view
				accessibilityLabel='track-context-menu'
				contentDescription='track-context-menu'
				onTap={this.handleCardTap}
				style={styles.card}
			>
				<view onTap={this.handleArtistTap} style={styles.logoTapArea}>
					<ArtistLogo
						containerStyle={styles.logoContainer}
						fallbackText={track.artistName ?? null}
						imageCache={imageCache}
						logoSource={artistLogoUrl}
						logoStyle={styles.logoImage}
					/>
				</view>
				<TrackList imageCache={imageCache} tracks={previewEntry} />
				<view style={styles.divider} />
				<view
					accessibilityLabel='track-context-play-next'
					contentDescription='track-context-play-next'
					onTap={this.handlePlayNext}
					style={styles.actionRow}
				>
					<image src={res.playnext} style={styles.icon} tint={theme.colors.muted} />
					<label style={styles.actionLabel} value='play next' />
				</view>
				<view
					accessibilityLabel='track-context-add-to-queue'
					contentDescription='track-context-add-to-queue'
					onTap={this.handleAddToQueue}
					style={styles.actionRow}
				>
					<image src={res.addtoqueue} style={styles.icon} tint={theme.colors.muted} />
					<label style={styles.actionLabel} value='add to queue' />
				</view>
				<view
					accessibilityLabel='track-context-add-to-playlist'
					contentDescription='track-context-add-to-playlist'
					onTap={this.handleAddToPlaylist}
					style={styles.actionRow}
				>
					<image src={res.addtoplaylist} style={styles.icon} tint={theme.colors.muted} />
					<label style={styles.actionLabel} value='add to playlist' />
				</view>
			</view>
		</blur>;
	}
}

const styles = {
	actionLabel: new Style<Label>({
		...theme.text.subLarger,
		paddingVertical: 4,
	}),
	actionRow: new Style({
		...theme.text.subLarger,
		flexDirection: 'row',
		paddingHorizontal: 4,
		paddingVertical: 12,
		width: '100%',
	}),
	backdrop: new Style<BlurView>({
		alignItems: 'center',
		backgroundColor: theme.colors.overlay,
		bottom: 0,
		height: '100%',
		justifyContent: 'center',
		left: 0,
		position: 'absolute',
		right: 0,
		top: 0,
		width: '100%',
		zIndex: 100,
	}),
	card: new Style({
		backgroundColor: theme.colors.bg,
		borderColor: theme.colors.separator,
		borderRadius: theme.borderRadius,
		borderWidth: 1,
		overflow: 'hidden',
		padding: 16,
		width: '90%',
	}),
	divider: new Style({
		backgroundColor: theme.colors.separator,
		height: 1,
		marginBottom: 8,
		marginTop: 8,
		width: '100%',
	}),
	icon: new Style<ImageView>({
		height: 18,
		margin: 10,
		width: 18,
	}),
	logoContainer: new Style({
		alignItems: 'center',
		height: 60,
		marginBottom: 12,
		overflow: 'hidden',
		width: '100%',
	}),
	logoImage: new Style({
		height: '100%',
		objectFit: 'contain',
		width: '100%',
	}),
	logoTapArea: new Style({
		width: '100%',
	}),
};
