// @ts-nocheck
import res from 'atolla/res';
import { StatefulComponent } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { ImageView, Label } from 'valdi_tsx/src/NativeTemplateElements';
import type { Album } from '../../models/Album';
import type { Track } from '../../models/Track';
import { theme } from '../../theme';
import { extractAccentColor } from '../../utils/colorExtractor';

export interface NowPlayingViewModel {
	album: Album;
	artistLogoUrl?: string | null;
	isPlaying: boolean;
	onNext: () => void;
	onPlayPause: () => void;
	onPrevious: () => void;
	progressSeconds: number;
	track: Track;
}

interface NowPlayingState {
	accentColor: string;
}

export class NowPlayingView extends StatefulComponent<NowPlayingViewModel, NowPlayingState> {
	state: NowPlayingState = {
		accentColor: theme.colors.active,
	};

	private colorUnsubscribe: (() => void) | null = null;

	onCreate(): void {
		this.refreshAccentColor();
	}

	onViewModelUpdate(): void {
		this.refreshAccentColor();
	}

	onDestroy(): void {
		this.colorUnsubscribe?.();
	}

	private refreshAccentColor(): void {
		this.colorUnsubscribe?.();
		this.colorUnsubscribe = null;
		if (this.viewModel.album.imageUrl) {
			this.colorUnsubscribe = extractAccentColor(this.viewModel.album.imageUrl, (hex) => {
				this.setState({ accentColor: hex });
			});
		}
	}

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
		const { accentColor } = this.state;

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

		<layout style={styles.root}>
			<scroll style={styles.scroll}>
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
					<label numberOfLines={2} style={styles.trackName} value={track.name} />
					<label numberOfLines={1} style={styles.albumLine} value={albumLine} />
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
			</scroll>
		</layout>;
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
		aspectRatio: 1,
		overflow: 'hidden',
		width: '100%',
	}),
	artworkImage: new Style<ImageView>({
		height: '100%',
		width: '100%',
	}),
	controlButton: new Style({
		alignItems: 'center',
		justifyContent: 'center',
		padding: 16,
	}),
	controlIcon: new Style<ImageView>({
		height: 28,
		width: 28,
	}),
	controlsRow: new Style({
		alignItems: 'center',
		flexDirection: 'row',
		justifyContent: 'center',
		marginTop: 8,
		width: '100%',
	}),
	infoSection: new Style({
		alignItems: 'center',
		marginTop: 20,
		paddingHorizontal: 24,
		width: '100%',
	}),
	playButton: new Style({
		alignItems: 'center',
		justifyContent: 'center',
		padding: 16,
	}),
	playIcon: new Style<ImageView>({
		height: 40,
		width: 40,
	}),
	progressSection: new Style({
		marginTop: 24,
		paddingHorizontal: 24,
		width: '100%',
	}),
	progressTrack: new Style({
		backgroundColor: theme.colors.bgAccent,
		borderRadius: 2,
		height: 4,
		overflow: 'hidden',
		width: '100%',
	}),
	root: new Style({
		flexGrow: 1,
		width: '100%',
	}),
	scroll: new Style({
		flexGrow: 1,
		paddingBottom: theme.scrollPaddingBottom,
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
	trackName: new Style<Label>({
		...theme.text.display,
		marginTop: 8,
		textAlign: 'center',
		width: '100%',
	}),
};
