// @ts-nocheck
import { StatefulComponent } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { BlurView, Label } from 'valdi_tsx/src/NativeTemplateElements';
import type { Track } from '../../models/Track';
import type { ImageCache } from '../../services/ImageCache';
import type { PlaybackStore } from '../../stores/Playback';
import { theme } from '../../theme';
import type { Transport } from '../../transports/Transport';
import { ArtistLogo } from './ArtistLogo';

export interface TrackContextMenuViewModel {
	imageCache?: ImageCache;
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
		this.viewModel.onDismiss('Playing next');
	};

	handleAddToQueue = (): void => {
		this.viewModel.playbackStore.addToQueue([this.viewModel.track]);
		this.viewModel.onDismiss('Added to queue');
	};

	handleAddToPlaylist = (): void => {
		this.viewModel.onDismiss();
	};

	onRender(): void {
		const { imageCache, track, onDismiss } = this.viewModel;
		const { artistLogoUrl } = this.state;

		<blur blurStyle='systemThickMaterialDark' onTap={() => onDismiss()} style={styles.backdrop}>
			<view onTap={() => {}} style={styles.card} testID='track-context-menu'>
				<ArtistLogo
					containerStyle={styles.logoContainer}
					fallbackText={track.artistName ?? null}
					imageCache={imageCache}
					logoSource={artistLogoUrl}
					logoStyle={styles.logoImage}
				/>
				<view style={styles.trackRow}>
					<layout style={styles.trackRowContent}>
						<layout style={styles.trackText}>
							<label
								ellipsizeMode='tail'
								numberOfLines={2}
								style={styles.trackTitle}
								value={track.name}
							/>
							{(track.artistName ?? track.albumName) && (
								<label
									ellipsizeMode='tail'
									numberOfLines={1}
									style={styles.trackMeta}
									value={track.artistName ?? track.albumName ?? ''}
								/>
							)}
						</layout>
					</layout>
				</view>
				<view style={styles.divider} />
				<view
					accessibilityLabel='track-context-play-next'
					contentDescription='track-context-play-next'
					onTap={this.handlePlayNext}
					style={styles.actionRow}
					testID='track-context-play-next'
				>
					<label style={styles.actionLabel} value='Play Next' />
				</view>
				<view
					accessibilityLabel='track-context-add-to-queue'
					contentDescription='track-context-add-to-queue'
					onTap={this.handleAddToQueue}
					style={styles.actionRow}
					testID='track-context-add-to-queue'
				>
					<label style={styles.actionLabel} value='Add to Queue' />
				</view>
				<view
					accessibilityLabel='track-context-add-to-playlist'
					contentDescription='track-context-add-to-playlist'
					onTap={this.handleAddToPlaylist}
					style={styles.actionRow}
					testID='track-context-add-to-playlist'
				>
					<label style={styles.actionLabel} value='Add to Playlist' />
				</view>
			</view>
		</blur>;
	}
}

const styles = {
	actionLabel: new Style<Label>({
		...theme.text.main,
		paddingVertical: 4,
	}),
	actionRow: new Style({
		borderRadius: theme.borderRadius / 2,
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
		backgroundColor: theme.colors.bgDeep,
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
	trackMeta: new Style<Label>({
		...theme.text.sub,
		marginTop: 2,
	}),
	trackRow: new Style({
		backgroundColor: theme.colors.bg,
		borderRadius: theme.borderRadius / 2,
		marginBottom: 4,
		paddingHorizontal: 10,
		paddingVertical: 8,
		width: '100%',
	}),
	trackRowContent: new Style({
		flexDirection: 'row',
		width: '100%',
	}),
	trackText: new Style({
		flex: 1,
		flexShrink: 1,
	}),
	trackTitle: new Style<Label>({
		...theme.text.mainBold,
	}),
};
