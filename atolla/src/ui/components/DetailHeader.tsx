// @ts-nocheck
import res from 'atolla/res';
import { StatefulComponent } from 'valdi_core/src/Component';
import { ElementRef } from 'valdi_core/src/ElementRef';
import { Style } from 'valdi_core/src/Style';
import type { ImageView, Label } from 'valdi_tsx/src/NativeTemplateElements';
import type { ImageCache, ImageCategory } from '../../services/ImageCache';
import { theme } from '../../theme';
import { animateRipple, createRippleStyle } from '../animations/Icons';
import { ArtistLogo } from './ArtistLogo';
import { CachedImage } from './CachedImage';
import { TappableIcon } from './TappableIcon';
import { Toast } from './Toast';
import { clearScheduledToast, scheduleToastDismiss } from './toastTimer';

export interface DetailHeaderViewModel {
	animationsEnabled: boolean;
	artworkCategory: ImageCategory;
	artworkSource: string | null;
	fallbackText?: string | null;
	imageCache?: ImageCache;
	logoSource?: string | null;
	onAddToQueue?: () => Promise<void>;
	onArtistTap?: () => void;
	onDownload?: () => void;
	onPlay?: () => void;
	onShuffle?: () => void;
	subheaderLineOneLeft?: string | null;
	subheaderLineOneRight?: string | null;
	subheaderLineTwoLeft?: string | null;
	subheaderLineTwoRight?: string | null;
}

interface DetailHeaderState {
	addToQueuePhase: 'idle' | 'confirming';
	checkmarkAnimated: boolean;
	toastMessage: string | null;
}

export class DetailHeader extends StatefulComponent<DetailHeaderViewModel, DetailHeaderState> {
	private checkmarkRef = new ElementRef();
	private rippleRef = new ElementRef();
	private confirmationTimer?: ReturnType<typeof setTimeout>;
	private toastTimer?: ReturnType<typeof setTimeout>;

	state: DetailHeaderState = {
		addToQueuePhase: 'idle',
		checkmarkAnimated: false,
		toastMessage: null,
	};

	onDestroy(): void {
		clearTimeout(this.confirmationTimer);
		this.toastTimer = clearScheduledToast(this.toastTimer);
	}

	private handleAddToQueueTap = async (): Promise<void> => {
		const { animationsEnabled, onAddToQueue } = this.viewModel;
		if (!onAddToQueue) return;

		if (animationsEnabled) {
			animateRipple(this, this.rippleRef, 40, 1.55);
		}

		try {
			await onAddToQueue();
		} catch {
			this.toastTimer = scheduleToastDismiss(
				this.toastTimer,
				(message) => this.setState({ toastMessage: message }),
				'Add to queue failed',
			);
			return;
		}

		const animated = animationsEnabled;
		this.setState({ addToQueuePhase: 'confirming', checkmarkAnimated: animated });

		if (animated) {
			setTimeout(() => {
				this.animatePromise({ curve: 'easeOut', duration: 0.2 }, () => {
					this.checkmarkRef.setAttribute('opacity', 1);
				});
			}, 0);
		}

		this.confirmationTimer = setTimeout(() => {
			this.setState({ addToQueuePhase: 'idle' });
		}, 2000);
	};

	onRender() {
		const {
			artworkSource,
			fallbackText,
			logoSource,
			onArtistTap,
			onDownload,
			onPlay,
			onShuffle,
			subheaderLineOneLeft,
			subheaderLineOneRight,
			subheaderLineTwoLeft,
			subheaderLineTwoRight,
		} = this.viewModel;

		const { addToQueuePhase, checkmarkAnimated, toastMessage } = this.state;

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
						<TappableIcon
							accessibilityLabel='detail-header-download-button'
							animationsEnabled={this.viewModel.animationsEnabled}
							icon={res.download}
							onTap={onDownload}
						/>
						<TappableIcon
							accessibilityLabel='detail-header-shuffle-button'
							animationsEnabled={this.viewModel.animationsEnabled}
							icon={res.shuffle}
							onTap={onShuffle}
						/>
						<view
							accessibilityLabel='detail-header-add-to-queue-button'
							contentDescription='detail-header-add-to-queue-button'
							onTap={addToQueuePhase === 'idle' ? this.handleAddToQueueTap : undefined}
							style={styles.addToQueueButton}
						>
							<view ref={this.rippleRef} style={createRippleStyle(theme.colors.white)} />
							{addToQueuePhase === 'idle' ? (
								<image src={res.addtoqueue} style={styles.buttonIcon} tint={theme.colors.white} />
							) : (
								<image
									ref={this.checkmarkRef}
									src={res.checkmark}
									style={checkmarkAnimated ? styles.buttonIconHidden : styles.buttonIcon}
									tint={theme.colors.white}
								/>
							)}
						</view>
						<TappableIcon
							accessibilityLabel='detail-header-play-button'
							animationsEnabled={this.viewModel.animationsEnabled}
							icon={res.play}
							onTap={onPlay}
						/>
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
			{toastMessage && <Toast message={toastMessage} />}
		</layout>;
	}
}

const styles = {
	addToQueueButton: new Style({
		alignItems: 'center',
		height: 40,
		justifyContent: 'center',
		overflow: 'visible',
		position: 'relative',
		width: 40,
	}),
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
	buttonIcon: new Style<ImageView>({
		height: 24,
		width: 24,
	}),
	buttonIconHidden: new Style<ImageView>({
		height: 24,
		opacity: 0,
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
