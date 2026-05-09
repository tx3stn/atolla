import res from 'atolla/res';
import { AnimationCurve } from 'valdi_core/src/AnimationOptions';
import { StatefulComponent } from 'valdi_core/src/Component';
import { ElementRef } from 'valdi_core/src/ElementRef';
import { Style } from 'valdi_core/src/Style';
import type { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';
import { createReusableCallback } from 'valdi_core/src/utils/Callback';
import type { DragEvent } from 'valdi_tsx/src/GestureEvents';
import type { ImageView, Label, Layout, View } from 'valdi_tsx/src/NativeTemplateElements';
import Strings from '../../Strings';
import type { DownloadState } from '../../services/DownloadService';
import type { ImageCache, ImageCategory } from '../../services/ImageCache';
import { theme } from '../../theme';
import { animateRipple, createRippleStyle } from '../animations/Icons';
import { hapticFeedback } from '../haptics';
import { ArtistLogo } from './ArtistLogo';
import { CachedImage } from './CachedImage';
import { FormatBadge } from './FormatBadge';
import { LoopingArrowSpinner } from './LoopingArrowSpinner';
import { Modal } from './Modal';
import { TappableIcon } from './TappableIcon';
import { Toast } from './Toast';
import { TouchEventState } from './TouchEventState';
import { clearScheduledToast, scheduleToastDismiss } from './toastTimer';

export interface DetailHeaderViewModel {
	animationsEnabled: boolean;
	artworkCategory: ImageCategory;
	artworkSource: string | null;
	downloadState?: DownloadState;
	fallbackText?: string | null;
	imageCache?: ImageCache;
	logoSource?: string | null;
	modalSlot?: DetachedSlot;
	onAddToQueue?: () => Promise<void>;
	onArtistTap?: () => void;
	onDownload?: () => void;
	onHideHeaderGesture?: () => void;
	onPlay?: () => void;
	onRemoveDownload?: () => void;
	onRevealHeaderGesture?: () => void;
	onShuffle?: () => void;
	subheaderLineOneLeft?: string | null;
	subheaderLineOneRight?: string | null;
	subheaderLineTwoBadge?: string | null;
	subheaderLineTwoLeft?: string | null;
	subheaderLineTwoRight?: string | null;
}

interface DetailHeaderState {
	addToQueuePhase: 'idle' | 'confirming';
	checkmarkAnimated: boolean;
	removeDownloadPhase: 'idle' | 'confirming' | 'confirmed';
	toastMessage: string | null;
}

export class DetailHeader extends StatefulComponent<DetailHeaderViewModel, DetailHeaderState> {
	private checkmarkRef = new ElementRef();
	private rippleRef = new ElementRef();
	private get removeDownloadBody(): string {
		return Strings.removeDownloadBody();
	}
	private confirmationTimer?: ReturnType<typeof setTimeout>;
	private checkmarkAnimTimer?: ReturnType<typeof setTimeout>;
	private removeDownloadTimer?: ReturnType<typeof setTimeout>;
	private toastTimer?: ReturnType<typeof setTimeout>;

	state: DetailHeaderState = {
		addToQueuePhase: 'idle',
		checkmarkAnimated: false,
		removeDownloadPhase: 'idle',
		toastMessage: null,
	};

	onDestroy(): void {
		clearTimeout(this.confirmationTimer);
		clearTimeout(this.checkmarkAnimTimer);
		clearTimeout(this.removeDownloadTimer);
		this.toastTimer = clearScheduledToast(this.toastTimer);
		this.viewModel.modalSlot?.slotted(() => {});
	}

	private handleRemoveDownloadTap = (): void => {
		this.setState({ removeDownloadPhase: 'confirming' });

		this.viewModel.modalSlot?.slotted(() => {
			<Modal
				body={this.removeDownloadBody}
				cancelAccessibilityLabel='detail-header-remove-download-no-btn'
				confirmAccessibilityLabel='detail-header-remove-download-yes-btn'
				modalAccessibilityLabel='detail-header-remove-download-modal'
				onClose={this.handleRemoveDownloadCancel}
				onConfirm={this.handleRemoveDownloadConfirm}
				title={Strings.removeDownloadTitle()}
			/>;
		});
	};

	private handleRemoveDownloadCancel = (): void => {
		this.viewModel.modalSlot?.slotted(() => {});
		this.setState({ removeDownloadPhase: 'idle' });
	};

	private handleRemoveDownloadConfirm = (): void => {
		this.viewModel.modalSlot?.slotted(() => {});
		this.viewModel.onRemoveDownload?.();

		if (this.removeDownloadTimer) {
			clearTimeout(this.removeDownloadTimer);
		}

		this.setState({ removeDownloadPhase: 'confirmed' });
		this.removeDownloadTimer = setTimeout(() => {
			this.setState({ removeDownloadPhase: 'idle' });
		}, 2000);
	};

	onViewModelUpdate(prevViewModel?: DetailHeaderViewModel): void {
		if (!prevViewModel) return;

		if (
			prevViewModel.downloadState !== this.viewModel.downloadState &&
			this.viewModel.downloadState !== 'downloaded' &&
			this.state.removeDownloadPhase !== 'idle'
		) {
			this.viewModel.modalSlot?.slotted(() => {});
			this.setState({ removeDownloadPhase: 'idle' });
		}
	}

	private handleAddToQueueTap = async (): Promise<void> => {
		const { animationsEnabled, onAddToQueue } = this.viewModel;
		if (!onAddToQueue) return;

		hapticFeedback();

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
			this.checkmarkAnimTimer = setTimeout(() => {
				if (this.state.addToQueuePhase !== 'confirming') return;
				this.animatePromise({ curve: AnimationCurve.EaseOut, duration: 0.2 }, () => {
					if (this.state.addToQueuePhase === 'confirming') {
						this.checkmarkRef.setAttribute('opacity', 1);
					}
				});
			}, 0);
		}

		this.confirmationTimer = setTimeout(() => {
			this.setState({ addToQueuePhase: 'idle' });
		}, 2000);
	};

	private handleHeaderDrag = (event: DragEvent): void => {
		if (event.state !== TouchEventState.Changed && event.state !== TouchEventState.Ended) {
			return;
		}

		if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) {
			return;
		}

		if (event.deltaY >= 18) {
			this.viewModel.onRevealHeaderGesture?.();
			return;
		}

		if (event.deltaY <= -18) {
			this.viewModel.onHideHeaderGesture?.();
		}
	};

	onRender() {
		const {
			artworkSource,
			downloadState,
			fallbackText,
			logoSource,
			onArtistTap,
			onDownload,
			onPlay,
			onShuffle,
			subheaderLineOneLeft,
			subheaderLineOneRight,
			subheaderLineTwoBadge,
			subheaderLineTwoLeft,
			subheaderLineTwoRight,
		} = this.viewModel;

		const { addToQueuePhase, checkmarkAnimated, removeDownloadPhase, toastMessage } = this.state;
		const showRemoveModal = removeDownloadPhase === 'confirming';
		const showRemoveConfirmation = removeDownloadPhase === 'confirmed';
		const downloadIcon = showRemoveConfirmation
			? res.trash
			: downloadState === 'downloaded'
				? res.downloaded
				: res.download;
		const onDownloadTap =
			showRemoveModal || showRemoveConfirmation
				? undefined
				: downloadState === 'downloaded'
					? this.handleRemoveDownloadTap
					: onDownload;
		<view
			onDrag={createReusableCallback((event) => {
				this.handleHeaderDrag(event);
			})}
			onDragPredicate={(event) => Math.abs(event.deltaY) > Math.abs(event.deltaX)}
			style={styles.root}
		>
			<layout style={styles.headerRow}>
				<view style={styles.artworkTile}>
					{artworkSource && (
						<CachedImage
							category={this.viewModel.artworkCategory}
							objectFit='cover'
							style={styles.artworkImage}
							url={artworkSource}
						/>
					)}
				</view>
				<layout style={styles.rightColumn}>
					<layout style={styles.logoArea}>
						<ArtistLogo
							containerStyle={styles.artistLogoContainer}
							fallbackText={fallbackText}
							imageCache={this.viewModel.imageCache}
							logoSource={logoSource}
							logoStyle={styles.artistLogoImage}
							onTap={onArtistTap}
							testID='detail-header-artist-logo'
						/>
					</layout>
					<layout style={styles.buttonsRow}>
						{downloadState === 'downloading' ? (
							<LoopingArrowSpinner
								accessibilityLabel='detail-header-downloading-spinner'
								size={24}
								tint={theme.colors.white}
							/>
						) : (
							<TappableIcon
								accessibilityLabel='detail-header-download-button'
								animationsEnabled={this.viewModel.animationsEnabled}
								icon={downloadIcon}
								onTap={onDownloadTap}
							/>
						)}
						<TappableIcon
							accessibilityLabel='detail-header-shuffle-button'
							animationsEnabled={this.viewModel.animationsEnabled}
							icon={res.shuffle}
							onTap={onShuffle}
						/>
						<view
							accessibilityLabel='detail-header-add-to-queue-button'
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
				subheaderLineTwoBadge ||
				subheaderLineTwoLeft ||
				subheaderLineTwoRight) && (
				<layout style={styles.subheaderLines}>
					{(subheaderLineOneLeft || subheaderLineOneRight) && (
						<layout style={styles.subheaderLineRow}>
							<label
								numberOfLines={7}
								style={styles.subheaderLineOneLeftText}
								value={subheaderLineOneLeft ?? ''}
							/>
							{subheaderLineOneRight && (
								<label style={styles.subheaderLineOneRightText} value={subheaderLineOneRight} />
							)}
						</layout>
					)}
					{(subheaderLineTwoLeft || subheaderLineTwoRight || subheaderLineTwoBadge) && (
						<layout style={styles.subheaderLineRowTwo}>
							<layout style={styles.subheaderLineTwoLeftGroup}>
								<label style={styles.subheaderLineTwoLeftText} value={subheaderLineTwoLeft ?? ''} />
								{subheaderLineTwoBadge && (
									<FormatBadge
										backgroundColor={theme.colors.bgRaised}
										value={subheaderLineTwoBadge}
									/>
								)}
							</layout>
							{subheaderLineTwoRight && (
								<label style={styles.subheaderLineTwoRightText} value={subheaderLineTwoRight} />
							)}
						</layout>
					)}
				</layout>
			)}
			{toastMessage && <Toast message={toastMessage} />}
			{showRemoveModal && !this.viewModel.modalSlot && (
				<Modal
					body={this.removeDownloadBody}
					cancelAccessibilityLabel='detail-header-remove-download-no-btn'
					confirmAccessibilityLabel='detail-header-remove-download-yes-btn'
					modalAccessibilityLabel='detail-header-remove-download-modal'
					onClose={this.handleRemoveDownloadCancel}
					onConfirm={this.handleRemoveDownloadConfirm}
					title={Strings.removeDownloadTitle()}
				/>
			)}
		</view>;
	}
}

const styles = {
	addToQueueButton: new Style<View>({
		alignItems: 'center',
		height: 40,
		justifyContent: 'center',
		overflow: 'visible',
		position: 'relative',
		width: 40,
	}),
	artistLogoContainer: new Style<View>({
		alignItems: 'flex-start',
		justifyContent: 'flex-start',
		paddingLeft: 2,
		width: '100%',
	}),
	artistLogoImage: new Style<ImageView>({
		height: 64,
		objectFit: 'contain',
		width: '88%',
	}),
	artworkImage: new Style<ImageView>({
		borderRadius: theme.borderRadius,
		height: '100%',
		width: '100%',
	}),
	artworkTile: new Style<View>({
		aspectRatio: 1,
		backgroundColor: theme.colors.bgAccent,
		borderRadius: theme.borderRadius,
		slowClipping: true,
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
	buttonsRow: new Style<Layout>({
		alignItems: 'center',
		bottom: 0,
		flexDirection: 'row',
		height: '25%',
		justifyContent: 'space-between',
		paddingBottom: 6,
		paddingLeft: 2,
		paddingRight: 6,
		paddingTop: 6,
		position: 'absolute',
		right: 0,
		width: '100%',
	}),
	headerRow: new Style<Layout>({
		alignItems: 'stretch',
		flexDirection: 'row',
		width: '100%',
	}),
	logoArea: new Style<Layout>({
		alignItems: 'center',
		height: '75%',
		justifyContent: 'flex-start',
		left: 0,
		position: 'absolute',
		top: 0,
		width: '100%',
	}),
	rightColumn: new Style<Layout>({
		alignSelf: 'stretch',
		flexDirection: 'column',
		height: '100%',
		marginLeft: 8,
		position: 'relative',
		width: '46%',
	}),
	root: new Style<View>({
		marginBottom: 12,
		padding: 4,
		position: 'relative',
		width: '100%',
	}),
	subheaderLineOneLeftText: new Style<Label>({
		...theme.text.display,
		marginLeft: 12,
		marginRight: 4,
		marginTop: 10,
	}),
	subheaderLineOneRightText: new Style<Label>({
		...theme.text.sub,
		marginRight: 12,
		marginTop: 10,
	}),
	subheaderLineRow: new Style<Layout>({
		alignItems: 'center',
		flexDirection: 'row',
		justifyContent: 'space-between',
		width: '100%',
	}),
	subheaderLineRowTwo: new Style<Layout>({
		alignItems: 'center',
		flexDirection: 'row',
		justifyContent: 'space-between',
		marginTop: 3,
		width: '100%',
	}),
	subheaderLines: new Style<Layout>({
		flexDirection: 'column',
		marginTop: 8,
		width: '100%',
	}),
	subheaderLineTwoLeftGroup: new Style<Layout>({
		alignItems: 'center',
		flexDirection: 'row',
		flexShrink: 1,
		marginLeft: 12,
		marginTop: 2,
	}),
	subheaderLineTwoLeftText: new Style<Label>({
		...theme.text.sub,
		marginRight: 10,
	}),
	subheaderLineTwoRightText: new Style<Label>({
		...theme.text.sub,
		marginRight: 12,
		marginTop: 2,
	}),
};
