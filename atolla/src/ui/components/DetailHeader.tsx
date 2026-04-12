// @ts-nocheck
import res from 'atolla/res';
import { StatefulComponent } from 'valdi_core/src/Component';
import { ElementRef } from 'valdi_core/src/ElementRef';
import { Style } from 'valdi_core/src/Style';
import type { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';
import { createReusableCallback } from 'valdi_core/src/utils/Callback';
import type { ImageView, Label } from 'valdi_tsx/src/NativeTemplateElements';
import type { DownloadState } from '../../services/DownloadService';
import type { ImageCache, ImageCategory } from '../../services/ImageCache';
import { theme } from '../../theme';
import { animateRipple, createRippleStyle } from '../animations/Icons';
import { ArtistLogo } from './ArtistLogo';
import { CachedImage } from './CachedImage';
import { LoopingArrowSpinner } from './LoopingArrowSpinner';
import { Modal } from './Modal';
import { TappableIcon } from './TappableIcon';
import { Toast } from './Toast';
import { clearScheduledToast, scheduleToastDismiss } from './toastTimer';

const TouchEventState = { Changed: 1, Ended: 2, Started: 0 } as const;

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
	onPlay?: () => void;
	onRemoveDownload?: () => void;
	onRevealHeaderGesture?: () => void;
	onShuffle?: () => void;
	subheaderLineOneLeft?: string | null;
	subheaderLineOneRight?: string | null;
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
	private readonly removeDownloadBody =
		'This will remove this download from your device.\n\nIf these tracks are part of a playlist they will not be removed unless you remove the playlist.';
	private confirmationTimer?: ReturnType<typeof setTimeout>;
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
				title='REMOVE DOWNLOAD?'
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

	private handleHeaderDrag = (event): void => {
		if (event.state !== TouchEventState.Changed && event.state !== TouchEventState.Ended) {
			return;
		}

		if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) {
			return;
		}

		if (event.deltaY >= 18) {
			this.viewModel.onRevealHeaderGesture?.();
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
		// biome-ignore lint/a11y/noStaticElementInteractions: Detail header supports reveal drag gesture.
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
							imageCache={this.viewModel.imageCache}
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
								numberOfLines={7}
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
			{showRemoveModal && !this.viewModel.modalSlot && (
				<Modal
					body={this.removeDownloadBody}
					cancelAccessibilityLabel='detail-header-remove-download-no-btn'
					confirmAccessibilityLabel='detail-header-remove-download-yes-btn'
					modalAccessibilityLabel='detail-header-remove-download-modal'
					onClose={this.handleRemoveDownloadCancel}
					onConfirm={this.handleRemoveDownloadConfirm}
					title='REMOVE DOWNLOAD?'
				/>
			)}
		</view>;
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
	artistLogoContainer: new Style({
		alignItems: 'center',
		justifyContent: 'flex-start',
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
		height: '25%',
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
	logoArea: new Style({
		alignItems: 'center',
		height: '75%',
		justifyContent: 'flex-start',
		left: 0,
		position: 'absolute',
		top: 0,
		width: '100%',
	}),
	rightColumn: new Style({
		alignSelf: 'stretch',
		flexDirection: 'column',
		height: '100%',
		marginLeft: 12,
		overflow: 'hidden',
		position: 'relative',
		width: '46%',
	}),
	root: new Style({
		marginBottom: 12,
		padding: 4,
		position: 'relative',
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
