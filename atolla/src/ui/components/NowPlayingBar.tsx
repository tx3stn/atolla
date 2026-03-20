// @ts-nocheck
import { Component } from 'valdi_core/src/Component';
import { ElementRef } from 'valdi_core/src/ElementRef';
import { Style } from 'valdi_core/src/Style';
import { TouchEventState } from 'valdi_tsx/src/GestureEvents';
import type { ImageView, Label } from 'valdi_tsx/src/NativeTemplateElements';
import type { Album } from '../../models/Album';
import type { Track } from '../../models/Track';
import { theme } from '../../theme';

export interface NowPlayingBarViewModel {
	album: Album;
	isPlaying: boolean;
	onDismiss: () => void;
	onTap: () => void;
	progressSeconds: number;
	track: Track;
}

export class NowPlayingBar extends Component<NowPlayingBarViewModel> {
	private barRef = new ElementRef();

	handleDrag = (event): void => {
		if (event.state === TouchEventState.Changed) {
			this.barRef.setAttribute('left', 8 + event.deltaX);
			this.barRef.setAttribute('right', 8 - event.deltaX);
			return;
		}

		if (event.state !== TouchEventState.Ended) return;

		const hasMoved = Math.abs(event.deltaX) > 5 || Math.abs(event.deltaY) > 5;
		if (!hasMoved) return;

		const isHorizontal = Math.abs(event.deltaX) >= Math.abs(event.deltaY);
		const hasEnoughDistance = Math.abs(event.deltaX) >= 120;
		const hasEnoughVelocity = Math.abs(event.velocityX) >= 600;

		if (isHorizontal && (hasEnoughDistance || hasEnoughVelocity)) {
			const offset = event.deltaX > 0 ? 500 : -500;
			this.animatePromise({ damping: 30, stiffness: 300 }, () => {
				this.barRef.setAttribute('left', 8 + offset);
				this.barRef.setAttribute('right', 8 - offset);
			}).then(() => {
				this.viewModel.onDismiss();
			});
		} else {
			this.animate({ damping: 18, stiffness: 280 }, () => {
				this.barRef.setAttribute('left', 8);
				this.barRef.setAttribute('right', 8);
			});
		}
	};

	onRender(): void {
		const { album, progressSeconds, track, onTap } = this.viewModel;
		const progressRatio = track.duration > 0 ? Math.min(progressSeconds / track.duration, 1) : 0;
		const elapsedText = formatDuration(progressSeconds);
		const totalText = formatDuration(track.duration);

		const progressFillStyle = new Style({
			backgroundColor: theme.colors.bgAccent,
			bottom: 0,
			left: 0,
			position: 'absolute',
			top: 0,
			width: `${Math.round(progressRatio * 100)}%`,
		});

		// biome-ignore lint/a11y/noStaticElementInteractions: Intentional swipe-to-dismiss gesture handler.
		<view onDrag={this.handleDrag} onTap={onTap} ref={this.barRef} style={styles.bar}>
			<view style={progressFillStyle} />
			{album.imageUrl && <image objectFit='cover' src={album.imageUrl} style={styles.artwork} />}
			<layout style={styles.info}>
				<label numberOfLines={1} style={styles.trackName} value={track.name} />
				<label
					numberOfLines={1}
					style={styles.artistName}
					value={track.artistName ?? album.artistName}
				/>
			</layout>
			<label style={styles.time} value={`${elapsedText} / ${totalText}`} />
		</view>;
	}
}

function formatDuration(seconds: number): string {
	const m = Math.floor(seconds / 60);
	const s = Math.floor(seconds % 60);
	return `${m}:${String(s).padStart(2, '0')}`;
}

const styles = {
	artistName: new Style<Label>({
		...theme.text.sub,
		paddingTop: 4,
	}),
	artwork: new Style<ImageView>({
		borderRadius: 8,
		flexShrink: 0,
		height: 65,
		marginRight: 14,
		width: 65,
	}),
	bar: new Style({
		alignItems: 'center',
		backgroundColor: theme.colors.bgDeep,
		borderRadius: theme.borderRadius,
		bottom: theme.footerHeight * 0.8,
		flexDirection: 'row',
		left: 8,
		marginLeft: 12,
		marginRight: 12,
		overflow: 'hidden',
		position: 'absolute',
		right: 8,
		zIndex: 15,
	}),
	info: new Style({
		flexGrow: 1,
		flexShrink: 1,
		justifyContent: 'center',
		marginRight: 12,
	}),
	time: new Style<Label>({
		...theme.text.sub,
		flexShrink: 0,
		paddingRight: 10,
	}),
	trackName: new Style<Label>({
		...theme.text.mainBold,
	}),
};
