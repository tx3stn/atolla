import res from 'atolla/res';
import { AnimationCurve } from 'valdi_core/src/AnimationOptions';
import { StatefulComponent } from 'valdi_core/src/Component';
import { ElementRef } from 'valdi_core/src/ElementRef';
import { Style } from 'valdi_core/src/Style';
import type { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';
import type { DragEvent } from 'valdi_tsx/src/GestureEvents';
import type { ImageView, Label, Layout, View } from 'valdi_tsx/src/NativeTemplateElements';
import Strings from '../../Strings';
import type { DownloadState } from '../../services/DownloadService';
import type { ImageCategory } from '../../services/ImageCache';
import { type ToastService, ToastTypes } from '../../services/ToastService';
import { theme } from '../../theme';
import { hapticFeedback } from '../../utils/Haptics';
import { animateRipple, createRippleStyle } from '../animations/Icons';
import { LoadingSpinner } from '../animations/LoadingSpinner';
import { ArtistLogo } from './ArtistLogo';
import { CachedImage } from './CachedImage';
import { FormatBadge } from './FormatBadge';
import { Modal } from './Modal';
import { TappableIcon } from './TappableIcon';
import { TouchEventState } from './TouchEventState';

export interface DetailHeaderViewModel {
	animationsEnabled: boolean;
	artworkCategory: ImageCategory;
	artworkSource: string | null;
	downloadEnabled?: boolean;
	downloadState?: DownloadState;
	fallbackText?: string | null;
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
	toastService: ToastService;
}

interface DetailHeaderState {
	addToQueuePhase: 'idle' | 'confirming';
	checkmarkAnimated: boolean;
	removeDownloadPhase: 'idle' | 'confirming' | 'confirmed';
}

export class DetailHeader extends StatefulComponent<DetailHeaderViewModel, DetailHeaderState> {
	private checkmarkRef = new ElementRef();
	private rippleRef = new ElementRef();
	private readonly emptySlot = (): void => {};
	private get removeDownloadBody(): string {
		return Strings.removeDownloadBody();
	}
	private confirmationTimer?: ReturnType<typeof setTimeout>;
	private checkmarkAnimTimer?: ReturnType<typeof setTimeout>;
	private removeDownloadTimer?: ReturnType<typeof setTimeout>;

	state: DetailHeaderState = {
		addToQueuePhase: 'idle',
		checkmarkAnimated: false,
		removeDownloadPhase: 'idle',
	};

	onDestroy(): void {
		clearTimeout(this.confirmationTimer);
		clearTimeout(this.checkmarkAnimTimer);
		clearTimeout(this.removeDownloadTimer);
		this.viewModel.modalSlot?.slotted(this.emptySlot);
	}

	private handleRemoveDownloadTap = (): void => {
		this.setState({ removeDownloadPhase: 'confirming' });

		this.viewModel.modalSlot?.slotted(() => {
			<Modal
				animationsEnabled={this.viewModel.animationsEnabled}
				body={this.removeDownloadBody}
				cancelAccessibilityId='detail-header-remove-download-no'
				confirmAccessibilityId='detail-header-remove-download-yes'
				modalAccessibilityId='detail-header-remove-download-modal'
				onClose={this.handleRemoveDownloadCancel}
				onConfirm={this.handleRemoveDownloadConfirm}
				title={Strings.removeDownloadTitle()}
			/>;
		});
	};

	private handleRemoveDownloadCancel = (): void => {
		this.viewModel.modalSlot?.slotted(this.emptySlot);
		this.setState({ removeDownloadPhase: 'idle' });
	};

	private handleRemoveDownloadConfirm = (): void => {
		this.viewModel.modalSlot?.slotted(this.emptySlot);
		this.viewModel.onRemoveDownload?.();

		if (this.removeDownloadTimer) {
			clearTimeout(this.removeDownloadTimer);
		}

		this.setState({ removeDownloadPhase: 'confirmed' });
		this.removeDownloadTimer = setTimeout(() => {
			this.setState({ removeDownloadPhase: 'idle' });
		}, 2000);
	};

	// a partial download offers the same modal as a completed one, but with two actions:
	// retry the failed tracks (re-runs onDownload) or remove what did download
	private handlePartialDownloadTap = (): void => {
		this.viewModel.modalSlot?.slotted(() => {
			<Modal
				animationsEnabled={this.viewModel.animationsEnabled}
				body={Strings.partialDownloadBody()}
				confirmAccessibilityId='detail-header-partial-download-retry'
				confirmLabel={Strings.partialDownloadRetry()}
				modalAccessibilityId='detail-header-partial-download-modal'
				onClose={this.handlePartialDownloadDismiss}
				onConfirm={this.handlePartialDownloadRetry}
				onSecondary={this.handlePartialDownloadRemove}
				secondaryAccessibilityId='detail-header-partial-download-remove'
				secondaryLabel={Strings.partialDownloadRemove()}
				title={Strings.partialDownloadTitle()}
			/>;
		});
	};

	private handlePartialDownloadDismiss = (): void => {
		this.viewModel.modalSlot?.slotted(this.emptySlot);
	};

	private handlePartialDownloadRetry = (): void => {
		this.viewModel.modalSlot?.slotted(this.emptySlot);
		this.viewModel.onDownload?.();
	};

	private handlePartialDownloadRemove = (): void => {
		this.viewModel.modalSlot?.slotted(this.emptySlot);
		this.viewModel.onRemoveDownload?.();
	};

	onViewModelUpdate(prevViewModel?: DetailHeaderViewModel): void {
		if (!prevViewModel) return;

		if (
			prevViewModel.downloadState !== this.viewModel.downloadState &&
			this.viewModel.downloadState !== 'downloaded' &&
			this.state.removeDownloadPhase !== 'idle'
		) {
			this.viewModel.modalSlot?.slotted(this.emptySlot);
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
			this.viewModel.toastService.show({
				message: Strings.addToQueueFailedToast(),
				variant: ToastTypes.error,
			});
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

	private isVerticalDrag = (event: DragEvent): boolean => {
		return Math.abs(event.deltaY) > Math.abs(event.deltaX);
	};

	onRender() {
		const {
			artworkSource,
			downloadEnabled,
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

		const { addToQueuePhase, checkmarkAnimated, removeDownloadPhase } = this.state;
		const showRemoveModal = removeDownloadPhase === 'confirming';
		const showRemoveConfirmation = removeDownloadPhase === 'confirmed';
		const downloadIcon = showRemoveConfirmation
			? res.trash
			: downloadState === 'downloaded'
				? res.downloaded
				: downloadState === 'partial'
					? res.downloadpartial
					: res.download;
		const onDownloadTap =
			showRemoveModal || showRemoveConfirmation
				? undefined
				: downloadState === 'downloaded'
					? this.handleRemoveDownloadTap
					: downloadState === 'partial'
						? this.handlePartialDownloadTap
						: onDownload;
		const isFreshDownload =
			!showRemoveModal &&
			!showRemoveConfirmation &&
			downloadState !== 'downloaded' &&
			downloadState !== 'partial';
		const downloadTapEnabled = !isFreshDownload || downloadEnabled !== false;
		<view onDrag={this.handleHeaderDrag} onDragPredicate={this.isVerticalDrag} style={styles.root}>
			<layout style={styles.headerRow}>
				<view
					accessibilityId='detail-header-artwork'
					accessibilityLabel='detail-header-artwork'
					style={styles.artworkTile}
				>
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
							accessibilityId='detail-header-artist-logo'
							containerStyle={styles.artistLogoContainer}
							fallbackText={fallbackText}
							fallbackTextContainerStyle={styles.artistFallbackContainer}
							logoSource={logoSource}
							logoStyle={styles.artistLogoImage}
							onTap={onArtistTap}
						/>
					</layout>
					<layout style={styles.buttonsRow}>
						<layout style={styles.buttonCell}>
							{downloadState === 'downloading' ? (
								<LoadingSpinner accessibilityId='detail-header-downloading-spinner' size={24} />
							) : (
								<TappableIcon
									accessibilityId='detail-header-download-button'
									animationsEnabled={this.viewModel.animationsEnabled}
									enabled={downloadTapEnabled}
									icon={downloadIcon}
									onTap={onDownloadTap}
								/>
							)}
						</layout>
						<layout style={styles.buttonCell}>
							<TappableIcon
								accessibilityId='detail-header-shuffle-button'
								animationsEnabled={this.viewModel.animationsEnabled}
								icon={res.shuffle}
								onTap={onShuffle}
							/>
						</layout>
						<layout style={styles.buttonCell}>
							<view
								accessibilityId='detail-header-add-to-queue-button'
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
						</layout>
						<layout style={styles.buttonCell}>
							<TappableIcon
								accessibilityId='detail-header-play-button'
								animationsEnabled={this.viewModel.animationsEnabled}
								icon={res.play}
								onTap={onPlay}
							/>
						</layout>
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
								numberOfLines={0}
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
			{showRemoveModal && !this.viewModel.modalSlot && (
				<Modal
					animationsEnabled={this.viewModel.animationsEnabled}
					body={this.removeDownloadBody}
					cancelAccessibilityId='detail-header-remove-download-no'
					confirmAccessibilityId='detail-header-remove-download-yes'
					modalAccessibilityId='detail-header-remove-download-modal'
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
	artistFallbackContainer: new Style<Layout>({
		padding: 0,
		width: '100%',
	}),
	artistLogoContainer: new Style<View>({
		alignItems: 'flex-start',
		justifyContent: 'flex-start',
		paddingLeft: 10,
		paddingRight: 10,
		width: '100%',
	}),
	artistLogoImage: new Style<ImageView>({
		height: 64,
		objectFit: 'contain',
		width: '100%',
	}),
	artworkImage: new Style<ImageView>({
		borderRadius: theme.radius.default,
		height: '100%',
		width: '100%',
	}),
	artworkTile: new Style<View>({
		aspectRatio: 1,
		backgroundColor: theme.colors.bgAccent,
		borderRadius: theme.radius.default,
		slowClipping: true,
		width: '50%',
	}),
	buttonCell: new Style<Layout>({
		alignItems: 'center',
		height: '100%',
		justifyContent: 'center',
		width: '25%',
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
