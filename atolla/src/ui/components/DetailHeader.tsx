// @ts-nocheck
import res from 'atolla/res';
import { Component } from 'valdi_core/src/Component';
import { ElementRef } from 'valdi_core/src/ElementRef';
import { Style } from 'valdi_core/src/Style';
import type { ImageView, Label } from 'valdi_tsx/src/NativeTemplateElements';
import type { ImageCache, ImageCategory } from '../../services/ImageCache';
import { theme } from '../../theme';
import { animateRipple, createRippleStyle } from '../animations/Icons';
import { ArtistLogo } from './ArtistLogo';
import { CachedImage } from './CachedImage';

export interface DetailHeaderViewModel {
	animationsEnabled: boolean;
	artworkCategory: ImageCategory;
	artworkSource: string | null;
	fallbackText?: string | null;
	imageCache?: ImageCache;
	logoSource?: string | null;
	onAddToQueue?: () => void;
	onArtistTap?: () => void;
	onDownload?: () => void;
	onPlay?: () => void;
	onShuffle?: () => void;
	subheaderLineOneLeft?: string | null;
	subheaderLineOneRight?: string | null;
	subheaderLineTwoLeft?: string | null;
	subheaderLineTwoRight?: string | null;
}

export class DetailHeader extends Component<DetailHeaderViewModel> {
	private downloadRippleRef = new ElementRef();
	private shuffleRippleRef = new ElementRef();
	private addToQueueRippleRef = new ElementRef();
	private playRippleRef = new ElementRef();

	private handleDownloadTap = (): void => {
		this.viewModel.onDownload?.();
		if (this.viewModel.animationsEnabled) animateRipple(this, this.downloadRippleRef);
	};

	private handleShuffleTap = (): void => {
		this.viewModel.onShuffle?.();
		if (this.viewModel.animationsEnabled) animateRipple(this, this.shuffleRippleRef);
	};

	private handleAddToQueueTap = (): void => {
		this.viewModel.onAddToQueue?.();
		if (this.viewModel.animationsEnabled) animateRipple(this, this.addToQueueRippleRef);
	};

	private handlePlayTap = (): void => {
		this.viewModel.onPlay?.();
		if (this.viewModel.animationsEnabled) animateRipple(this, this.playRippleRef);
	};

	onRender() {
		const {
			artworkSource,
			fallbackText,
			logoSource,
			onAddToQueue,
			onArtistTap,
			onDownload,
			onPlay,
			onShuffle,
			subheaderLineOneLeft,
			subheaderLineOneRight,
			subheaderLineTwoLeft,
			subheaderLineTwoRight,
		} = this.viewModel;

		const rippleStyle = createRippleStyle(theme.colors.white);

		<layout style={styles.root}>
			<layout style={styles.headerRow}>
				<view style={styles.artworkTile}>
					{artworkSource && (
						<CachedImage
							category={this.viewModel.artworkCategory}
							imageCache={this.viewModel.imageCache}
							objectFit='cover'
							style={styles.artworkImage}
							url={artworkSource}
						/>
					)}
				</view>
				<layout style={styles.rightColumn}>
					<ArtistLogo
						fallbackText={fallbackText}
						imageCache={this.viewModel.imageCache}
						logoSource={logoSource}
						onTap={onArtistTap}
						testID='detail-header-artist-logo'
					/>
					<layout style={styles.buttonsRow}>
						<view onTap={onDownload ? this.handleDownloadTap : undefined} style={styles.button}>
							<view ref={this.downloadRippleRef} style={rippleStyle} />
							<image
								src={res.download}
								style={styles.buttonIcon}
								tint={onDownload ? theme.colors.white : theme.colors.muted}
							/>
						</view>
						<view onTap={onShuffle ? this.handleShuffleTap : undefined} style={styles.button}>
							<view ref={this.shuffleRippleRef} style={rippleStyle} />
							<image
								src={res.shuffle}
								style={styles.buttonIcon}
								tint={onShuffle ? theme.colors.white : theme.colors.muted}
							/>
						</view>
						<view onTap={onAddToQueue ? this.handleAddToQueueTap : undefined} style={styles.button}>
							<view ref={this.addToQueueRippleRef} style={rippleStyle} />
							<image
								src={res.addtoqueue}
								style={styles.buttonIcon}
								tint={onAddToQueue ? theme.colors.white : theme.colors.muted}
							/>
						</view>
						<view onTap={onPlay ? this.handlePlayTap : undefined} style={styles.button}>
							<view ref={this.playRippleRef} style={rippleStyle} />
							<image
								src={res.play}
								style={styles.buttonIcon}
								tint={onPlay ? theme.colors.white : theme.colors.muted}
							/>
						</view>
					</layout>
				</layout>
			</layout>
			{(subheaderLineOneLeft ||
				subheaderLineOneRight ||
				subheaderLineTwoLeft ||
				subheaderLineTwoRight) && (
				<layout style={styles.subheaderLines}>
					{(subheaderLineOneLeft || subheaderLineOneRight) && (
						<layout style={styles.subheaderLineRow}>
							<label
								numberOfLines={2}
								style={styles.subheaderLineOneLeftText}
								value={subheaderLineOneLeft ?? ''}
							/>
							{subheaderLineOneRight && (
								<label style={styles.subheaderLineOneRightText} value={subheaderLineOneRight} />
							)}
						</layout>
					)}
					{(subheaderLineTwoLeft || subheaderLineTwoRight) && (
						<layout style={styles.subheaderLineRowTwo}>
							<label style={styles.subheaderLineTwoLeftText} value={subheaderLineTwoLeft ?? ''} />
							{subheaderLineTwoRight && (
								<label style={styles.subheaderLineTwoRightText} value={subheaderLineTwoRight} />
							)}
						</layout>
					)}
				</layout>
			)}
		</layout>;
	}
}

const styles = {
	artworkImage: new Style<ImageView>({
		borderRadius: theme.borderRadius,
		height: '100%',
		width: '100%',
	}),
	artworkTile: new Style({
		aspectRatio: 1,
		backgroundColor: theme.colors.bgAccent,
		borderRadius: theme.borderRadius,
		overflow: 'hidden',
		width: '50%',
	}),
	button: new Style({
		alignItems: 'center',
		height: 40,
		justifyContent: 'center',
		overflow: 'visible',
		position: 'relative',
		width: 40,
	}),
	buttonIcon: new Style<ImageView>({
		height: 24,
		width: 24,
	}),
	buttonsRow: new Style({
		alignItems: 'center',
		bottom: 0,
		columnGap: 4,
		flexDirection: 'row',
		justifyContent: 'flex-end',
		padding: 6,
		position: 'absolute',
		right: 0,
		width: '100%',
	}),
	headerRow: new Style({
		alignItems: 'stretch',
		flexDirection: 'row',
		width: '100%',
	}),
	rightColumn: new Style({
		alignSelf: 'stretch',
		flexDirection: 'column',
		marginLeft: 12,
		width: '46%',
	}),
	root: new Style({
		marginBottom: 12,
		padding: 4,
		width: '100%',
	}),
	subheaderLineOneLeftText: new Style<Label>({
		...theme.text.display,
		marginLeft: 12,
		marginTop: 10,
		paddingHorizontal: 4,
	}),
	subheaderLineOneRightText: new Style<Label>({
		...theme.text.sub,
		marginRight: 12,
		marginTop: 10,
		paddingHorizontal: 4,
	}),
	subheaderLineRow: new Style({
		alignItems: 'center',
		flexDirection: 'row',
		justifyContent: 'space-between',
		width: '100%',
	}),
	subheaderLineRowTwo: new Style({
		alignItems: 'center',
		flexDirection: 'row',
		justifyContent: 'space-between',
		marginTop: 3,
		width: '100%',
	}),
	subheaderLines: new Style({
		flexDirection: 'column',
		marginTop: 8,
		width: '100%',
	}),
	subheaderLineTwoLeftText: new Style<Label>({
		...theme.text.sub,
		marginLeft: 12,
		marginTop: 2,
		paddingHorizontal: 4,
	}),
	subheaderLineTwoRightText: new Style<Label>({
		...theme.text.sub,
		marginRight: 12,
		marginTop: 2,
		paddingHorizontal: 4,
	}),
};
