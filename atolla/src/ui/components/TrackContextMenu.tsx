// @ts-nocheck
import res from 'atolla/res';
import { StatefulComponent } from 'valdi_core/src/Component';
import { ElementRef } from 'valdi_core/src/ElementRef';
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
	animationsEnabled?: boolean;
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
	private playNextRippleRef = new ElementRef();
	private addToQueueRippleRef = new ElementRef();
	private addToPlaylistRippleRef = new ElementRef();

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
		this.viewModel.onDismiss();
	};

	handleAddToQueue = (): void => {
		this.viewModel.playbackStore.addToQueue([this.viewModel.track]);
		this.viewModel.onDismiss();
	};

	handleAddToPlaylist = (): void => {
		this.viewModel.onDismiss();
	};

	handlePlayNextTap = (): void => {
		this.runActionWithTapFeedback(this.handlePlayNext, this.playNextRippleRef);
	};

	handleAddToQueueTap = (): void => {
		this.runActionWithTapFeedback(this.handleAddToQueue, this.addToQueueRippleRef);
	};

	handleAddToPlaylistTap = (): void => {
		this.runActionWithTapFeedback(this.handleAddToPlaylist, this.addToPlaylistRippleRef);
	};

	handleBackdropTap = (): void => {
		this.viewModel.onDismiss();
	};

	handleArtistTap = (): void => {
		if (this.viewModel.onArtistTap) {
			this.viewModel.onArtistTap();
		}
		this.viewModel.onDismiss();
	};

	private runActionWithTapFeedback(action: () => void, rippleRef: ElementRef): void {
		if (this.viewModel.animationsEnabled === false) {
			action();
			return;
		}

		animateRowPressOverlay(this, rippleRef);
		setTimeout(() => {
			action();
		}, 80);
	}

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
					onTap={this.handlePlayNextTap}
					style={styles.actionRow}
				>
					<view ref={this.playNextRippleRef} style={styles.actionRowRipple} />
					<image src={res.playnext} style={styles.icon} tint={theme.colors.muted} />
					<label style={styles.actionLabel} value='play next' />
				</view>
				<view
					accessibilityLabel='track-context-add-to-queue'
					contentDescription='track-context-add-to-queue'
					onTap={this.handleAddToQueueTap}
					style={styles.actionRow}
				>
					<view ref={this.addToQueueRippleRef} style={styles.actionRowRipple} />
					<image src={res.addtoqueue} style={styles.icon} tint={theme.colors.muted} />
					<label style={styles.actionLabel} value='add to queue' />
				</view>
				<view
					accessibilityLabel='track-context-add-to-playlist'
					contentDescription='track-context-add-to-playlist'
					onTap={this.handleAddToPlaylistTap}
					style={styles.actionRow}
				>
					<view ref={this.addToPlaylistRippleRef} style={styles.actionRowRipple} />
					<image src={res.addtoplaylist} style={styles.icon} tint={theme.colors.muted} />
					<label style={styles.actionLabel} value='add to playlist' />
				</view>
			</view>
		</blur>;
	}
}

function animateRowPressOverlay(
	component: { animatePromise: (options: object, callback: () => void) => Promise<void> },
	ref: ElementRef,
): void {
	ref.setAttribute('opacity', 0);

	component
		.animatePromise({ curve: 'easeOut', duration: 0.07 }, () => {
			ref.setAttribute('opacity', 0.18);
		})
		.then(() => {
			return component.animatePromise({ curve: 'easeOut', duration: 0.28 }, () => {
				ref.setAttribute('opacity', 0);
			});
		});
}

const styles = {
	actionLabel: new Style<Label>({
		...theme.text.subLarger,
		paddingVertical: 4,
	}),
	actionRow: new Style({
		...theme.text.subLarger,
		flexDirection: 'row',
		overflow: 'hidden',
		paddingHorizontal: 4,
		paddingVertical: 12,
		position: 'relative',
		width: '100%',
	}),
	actionRowRipple: new Style({
		backgroundColor: theme.colors.white,
		bottom: 0,
		left: 0,
		opacity: 0,
		position: 'absolute',
		right: 0,
		top: 0,
		zIndex: 2,
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
