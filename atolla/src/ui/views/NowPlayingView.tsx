// @ts-nocheck
import res from 'atolla/res';
import { Component } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import { TouchEventState } from 'valdi_tsx/src/GestureEvents';
import type { ImageView, Label } from 'valdi_tsx/src/NativeTemplateElements';
import type { Album } from '../../models/Album';
import type { Track } from '../../models/Track';
import { theme } from '../../theme';

export interface NowPlayingViewModel {
	album: Album;
	artistLogoUrl?: string | null;
	isPlaying: boolean;
	onClose?: () => void;
	onNext: () => void;
	onPlayPause: () => void;
	onPrevious: () => void;
	progressSeconds: number;
	track: Track;
}

export class NowPlayingView extends Component<NowPlayingViewModel> {
	private readonly closeDragDistance = 36;
	private readonly closeDragVelocity = 550;
	private touchStartX = 0;
	private touchStartY = 0;

	private handleDismissDrag = (event): void => {
		const { onClose } = this.viewModel;
		if (!onClose) {
			return;
		}

		if (event.state !== TouchEventState.Ended) {
			return;
		}

		if (Math.abs(event.deltaY) < Math.abs(event.deltaX)) {
			return;
		}

		const isDownwardDistance = event.deltaY >= this.closeDragDistance;
		const isDownwardFlick = event.deltaY > 8 && event.velocityY >= this.closeDragVelocity;

		if (!isDownwardDistance && !isDownwardFlick) {
			return;
		}

		onClose();
	};

	private handleDismissTouch = (event): void => {
		if (event.state === TouchEventState.Started) {
			this.touchStartX = event.absoluteX;
			this.touchStartY = event.absoluteY;
			return;
		}

		if (event.state !== TouchEventState.Ended) {
			return;
		}

		const { onClose } = this.viewModel;
		if (!onClose) {
			return;
		}

		const deltaX = event.absoluteX - this.touchStartX;
		const deltaY = event.absoluteY - this.touchStartY;

		if (Math.abs(deltaY) < Math.abs(deltaX)) {
			return;
		}

		if (deltaY < this.closeDragDistance) {
			return;
		}

		onClose();
	};

	onRender(): void {
		const {
			album,
			artistLogoUrl,
			isPlaying,
			onNext,
			onPlayPause,
			onPrevious,
			progressSeconds,
			track,
		} = this.viewModel;
		const accentColor = theme.colors.white;

		const progressRatio = track.duration > 0 ? Math.min(progressSeconds / track.duration, 1) : 0;
		const elapsedText = formatDuration(progressSeconds);
		const remainingText = `-${formatDuration(Math.max(0, track.duration - progressSeconds))}`;
		const albumLine = album.releaseDate
			? `${album.name} (${album.releaseDate.slice(0, 4)})`
			: album.name;

		const progressFillStyle = new Style({
			backgroundColor: accentColor,
			borderRadius: 2,
			height: '100%',
			width: `${Math.round(progressRatio * 100)}%`,
		});
		// biome-ignore lint/a11y/noStaticElementInteractions: Intentional swipe-down gesture handler for dismiss.
		<view
			id={`now-playing-${track.id}`}
			onDrag={this.handleDismissDrag}
			onTouch={this.handleDismissTouch}
			style={styles.root}
		>
			<layout style={styles.content}>
				<view style={styles.artworkContainer}>
					{album.imageUrl && (
						<image objectFit='cover' src={album.imageUrl} style={styles.artworkImage} />
					)}
				</view>
				<layout style={styles.infoSection}>
					{artistLogoUrl && (
						<image objectFit='contain' src={artistLogoUrl} style={styles.artistLogo} />
					)}
					{!artistLogoUrl && <label style={styles.artistName} value={album.artistName} />}
				</layout>
				<layout style={styles.bottomSection}>
					<layout style={styles.trackMetaSection}>
						<label numberOfLines={2} style={styles.trackName} value={track.name} />
						<label numberOfLines={2} style={styles.albumLine} value={albumLine} />
					</layout>
					<layout style={styles.progressSection}>
						<view style={styles.progressTrack}>
							<view style={progressFillStyle} />
						</view>
						<layout style={styles.timeRow}>
							<label style={styles.timeLabel} value={elapsedText} />
							<label style={styles.timeLabel} value={remainingText} />
						</layout>
					</layout>
					<layout style={styles.controlsRow}>
						<view onTap={onPrevious} style={styles.controlButton}>
							<image src={res.previous} style={styles.controlIcon} tint={accentColor} />
						</view>
						<view onTap={onPlayPause} style={styles.playButton}>
							<image
								src={isPlaying ? res.pause : res.play}
								style={styles.playIcon}
								tint={accentColor}
							/>
						</view>
						<view onTap={onNext} style={styles.controlButton}>
							<image src={res.next} style={styles.controlIcon} tint={accentColor} />
						</view>
					</layout>
					<layout style={styles.queueTabsRow}>
						<view style={styles.queueTabButton}>
							<label style={styles.queueTabLabel} value='BACK TO' />
						</view>
						<view style={styles.queueTabButton}>
							<label style={styles.queueTabLabel} value='UP NEXT' />
						</view>
					</layout>
				</layout>
			</layout>
		</view>;
	}
}

function formatDuration(seconds: number): string {
	const m = Math.floor(seconds / 60);
	const s = Math.floor(seconds % 60);
	return `${m}:${String(s).padStart(2, '0')}`;
}

const styles = {
	albumLine: new Style<Label>({
		...theme.text.sub,
		marginTop: 4,
		textAlign: 'center',
		width: '100%',
	}),
	artistLogo: new Style<ImageView>({
		height: 48,
		marginBottom: 8,
		objectFit: 'contain',
		width: '100%',
	}),
	artistName: new Style<Label>({
		...theme.text.mutedHeader,
		marginBottom: 8,
		textAlign: 'center',
		width: '100%',
	}),
	artworkContainer: new Style({
		alignItems: 'center',
		aspectRatio: 1,
		justifyContent: 'center',
		overflow: 'hidden',
		width: '100%',
	}),
	artworkImage: new Style<ImageView>({
		borderRadius: theme.borderRadius,
		height: '98%',
		width: '98%',
	}),
	bottomSection: new Style({
		marginBottom: theme.footerHeight - 24,
		marginTop: 'auto',
		width: '100%',
	}),
	content: new Style({
		flexGrow: 1,
		height: '100%',
		width: '100%',
	}),
	controlButton: new Style({
		alignItems: 'center',
		justifyContent: 'center',
		padding: 16,
	}),
	controlIcon: new Style<ImageView>({
		height: 35,
		width: 35,
	}),
	controlsRow: new Style({
		alignItems: 'center',
		flexDirection: 'row',
		justifyContent: 'center',
		marginBottom: 12,
		marginTop: 12,
		width: '100%',
	}),
	infoSection: new Style({
		alignItems: 'center',
		flexGrow: 1,
		justifyContent: 'center',
		paddingHorizontal: 24,
		width: '100%',
	}),
	playButton: new Style({
		alignItems: 'center',
		justifyContent: 'center',
		padding: 16,
	}),
	playIcon: new Style<ImageView>({
		height: 45,
		width: 45,
	}),
	progressSection: new Style({
		marginTop: 4,
		paddingLeft: 30,
		paddingRight: 30,
		width: '100%',
	}),
	progressTrack: new Style({
		backgroundColor: theme.colors.bgAccent,
		borderRadius: 2,
		height: 4,
		marginTop: 10,
		overflow: 'hidden',
		width: '100%',
	}),
	queueTabButton: new Style({
		alignItems: 'center',
		flexGrow: 1,
		justifyContent: 'flex-end',
		paddingTop: 4,
	}),
	queueTabLabel: new Style<Label>({
		...theme.text.sub,
		textAlign: 'center',
	}),
	queueTabsRow: new Style({
		borderTopColor: theme.colors.bgAccent,
		borderTopWidth: 1,
		flexDirection: 'row',
		width: '100%',
	}),
	root: new Style({
		flexGrow: 1,
		height: '100%',
		position: 'relative',
		width: '100%',
	}),
	timeLabel: new Style<Label>({
		...theme.text.sub,
	}),
	timeRow: new Style({
		flexDirection: 'row',
		justifyContent: 'space-between',
		marginTop: 6,
		width: '100%',
	}),
	trackMetaSection: new Style({
		alignItems: 'center',
		marginBottom: 10,
		paddingHorizontal: 24,
		width: '100%',
	}),
	trackName: new Style<Label>({
		...theme.text.main,
		textAlign: 'center',
		width: '100%',
	}),
};
