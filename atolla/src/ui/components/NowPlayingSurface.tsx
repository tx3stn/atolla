// @ts-nocheck
import res from 'atolla/res';
import { StatefulComponent } from 'valdi_core/src/Component';
import { ElementRef } from 'valdi_core/src/ElementRef';
import { Style } from 'valdi_core/src/Style';
import { TouchEventState } from 'valdi_tsx/src/GestureEvents';
import type { ImageView, Label } from 'valdi_tsx/src/NativeTemplateElements';
import type { Album } from '../../models/Album';
import type { Track } from '../../models/Track';
import { theme } from '../../theme';

export interface NowPlayingSurfaceViewModel {
	album: Album;
	artistLogoUrl?: string | null;
	collapseSignal: number;
	isPlaying: boolean;
	onDismiss: () => void;
	onNext: () => void;
	onPlayPause: () => void;
	onPrevious: () => void;
	progressSeconds: number;
	track: Track;
}

interface NowPlayingSurfaceState {
	isExpanded: boolean;
}

export class NowPlayingSurface extends StatefulComponent<
	NowPlayingSurfaceViewModel,
	NowPlayingSurfaceState
> {
	private overlayRef = new ElementRef();
	private overlayCardRef = new ElementRef();
	private compactBarRef = new ElementRef();
	private expandedContentRef = new ElementRef();
	private transitionArtworkRef = new ElementRef();
	private touchStartX = 0;
	private touchStartY = 0;
	private isTransitioning = false;

	private readonly closeDragDistance = 36;
	private readonly closeDragVelocity = 550;
	private readonly collapsedInset = 20;
	private readonly collapsedBottom = theme.footerHeight * 0.8;
	private readonly collapsedHeight = 84;

	state: NowPlayingSurfaceState = {
		isExpanded: false,
	};

	private openSurface = (): void => {
		if (this.state.isExpanded || this.isTransitioning) {
			return;
		}

		this.isTransitioning = true;
		this.setState({ isExpanded: true });
		this.overlayRef.setAttribute('top', 0);
		this.setCollapsedGeometry();
		this.transitionArtworkRef.setAttribute('opacity', 1);

		this.animatePromise({ beginFromCurrentState: true, curve: 'easeOut', duration: 0.34 }, () => {
			this.compactBarRef.setAttribute('opacity', 0);
			this.overlayCardRef.setAttribute('bottom', 0);
			this.overlayCardRef.setAttribute('borderRadius', 0);
			this.overlayCardRef.setAttribute('height', '100%');
			this.overlayCardRef.setAttribute('left', 0);
			this.overlayCardRef.setAttribute('right', 0);
			this.expandedContentRef.setAttribute('left', 0);
			this.expandedContentRef.setAttribute('opacity', 0.92);
			this.expandedContentRef.setAttribute('right', 0);
			this.expandedContentRef.setAttribute('top', 0);
			this.transitionArtworkRef.setAttribute('left', '1%');
			this.transitionArtworkRef.setAttribute('marginTop', 0);
			this.transitionArtworkRef.setAttribute('top', 2);
			this.transitionArtworkRef.setAttribute('width', '98%');
		})
			.then(() => {
				return this.animatePromise(
					{ beginFromCurrentState: true, curve: 'easeOut', duration: 0.08 },
					() => {
						this.expandedContentRef.setAttribute('opacity', 1);
						this.transitionArtworkRef.setAttribute('opacity', 1);
					},
				);
			})
			.then(() => {
				this.isTransitioning = false;
			});
	};

	onViewModelUpdate(prevViewModel: NowPlayingSurfaceViewModel): void {
		if (!prevViewModel) {
			return;
		}

		if (this.viewModel.collapseSignal === prevViewModel.collapseSignal) {
			return;
		}

		if (!this.state.isExpanded) {
			return;
		}

		this.closeSurface();
	}

	private closeSurface = (): void => {
		if (!this.state.isExpanded || this.isTransitioning) {
			return;
		}

		this.isTransitioning = true;

		this.animatePromise({ beginFromCurrentState: true, curve: 'easeIn', duration: 0.04 }, () => {
			this.transitionArtworkRef.setAttribute('opacity', 1);
		})
			.then(() => {
				return this.animatePromise(
					{ beginFromCurrentState: true, curve: 'easeIn', duration: 0.26 },
					() => {
						this.overlayRef.setAttribute('top', 0);
						this.compactBarRef.setAttribute('opacity', 1);
						this.overlayCardRef.setAttribute('bottom', this.collapsedBottom);
						this.overlayCardRef.setAttribute('borderRadius', theme.borderRadius);
						this.overlayCardRef.setAttribute('height', this.collapsedHeight);
						this.overlayCardRef.setAttribute('left', this.collapsedInset);
						this.overlayCardRef.setAttribute('right', this.collapsedInset);
						this.expandedContentRef.setAttribute('left', 14);
						this.expandedContentRef.setAttribute('opacity', 0);
						this.expandedContentRef.setAttribute('right', 14);
						this.expandedContentRef.setAttribute('top', 52);
						this.transitionArtworkRef.setAttribute('left', 12);
						this.transitionArtworkRef.setAttribute('marginTop', 0);
						this.transitionArtworkRef.setAttribute('top', 10);
						this.transitionArtworkRef.setAttribute('width', 65);
					},
				);
			})
			.then(() => {
				this.overlayRef.setAttribute('top', 2000);
				this.setState({ isExpanded: false });
				this.isTransitioning = false;
			});
	};

	private setCollapsedGeometry(): void {
		this.compactBarRef.setAttribute('opacity', 1);
		this.overlayCardRef.setAttribute('bottom', this.collapsedBottom);
		this.overlayCardRef.setAttribute('borderRadius', theme.borderRadius);
		this.overlayCardRef.setAttribute('height', this.collapsedHeight);
		this.overlayCardRef.setAttribute('left', this.collapsedInset);
		this.overlayCardRef.setAttribute('right', this.collapsedInset);
		this.expandedContentRef.setAttribute('left', 14);
		this.expandedContentRef.setAttribute('opacity', 0);
		this.expandedContentRef.setAttribute('right', 14);
		this.expandedContentRef.setAttribute('top', 52);
		this.transitionArtworkRef.setAttribute('left', 12);
		this.transitionArtworkRef.setAttribute('marginTop', 0);
		this.transitionArtworkRef.setAttribute('top', 10);
		this.transitionArtworkRef.setAttribute('width', 65);
	}

	private handleCompactDrag = (event): void => {
		if (this.state.isExpanded) {
			return;
		}

		if (event.state === TouchEventState.Changed) {
			this.compactBarRef.setAttribute('left', 8 + event.deltaX);
			this.compactBarRef.setAttribute('right', 8 - event.deltaX);
			return;
		}

		if (event.state !== TouchEventState.Ended) {
			return;
		}

		const hasMoved = Math.abs(event.deltaX) > 5 || Math.abs(event.deltaY) > 5;
		if (!hasMoved) {
			return;
		}

		const isHorizontal = Math.abs(event.deltaX) >= Math.abs(event.deltaY);
		const hasEnoughDistance = Math.abs(event.deltaX) >= 120;
		const hasEnoughVelocity = Math.abs(event.velocityX) >= 600;

		if (isHorizontal && (hasEnoughDistance || hasEnoughVelocity)) {
			const offset = event.deltaX > 0 ? 500 : -500;
			this.animatePromise({ damping: 30, stiffness: 300 }, () => {
				this.compactBarRef.setAttribute('left', 8 + offset);
				this.compactBarRef.setAttribute('right', 8 - offset);
			}).then(() => {
				this.viewModel.onDismiss();
			});
			return;
		}

		this.animate({ damping: 18, stiffness: 280 }, () => {
			this.compactBarRef.setAttribute('left', 8);
			this.compactBarRef.setAttribute('right', 8);
		});
	};

	private handleExpandedDrag = (event): void => {
		if (!this.state.isExpanded) {
			return;
		}

		if (event.state === TouchEventState.Changed) {
			if (event.deltaY > 0 && Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
				this.overlayRef.setAttribute('top', event.deltaY);
			}
			return;
		}

		if (event.state !== TouchEventState.Ended) {
			return;
		}

		if (Math.abs(event.deltaY) < Math.abs(event.deltaX)) {
			this.handleExpandedDragCancel();
			return;
		}

		const isDownwardDistance = event.deltaY >= this.closeDragDistance;
		const isDownwardFlick = event.deltaY > 8 && event.velocityY >= this.closeDragVelocity;

		if (!isDownwardDistance && !isDownwardFlick) {
			this.handleExpandedDragCancel();
			return;
		}

		this.closeSurface();
	};

	private handleExpandedTouch = (event): void => {
		if (!this.state.isExpanded) {
			return;
		}

		if (event.state === TouchEventState.Started) {
			this.touchStartX = event.absoluteX;
			this.touchStartY = event.absoluteY;
			return;
		}

		if (event.state !== TouchEventState.Ended) {
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

		this.closeSurface();
	};

	private handleExpandedDragCancel = (): void => {
		this.animate({ beginFromCurrentState: true, curve: 'easeOut', duration: 0.2 }, () => {
			this.overlayRef.setAttribute('top', 0);
		});
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
		const totalText = formatDuration(track.duration);
		const albumLine = album.releaseDate
			? `${album.name} (${album.releaseDate.slice(0, 4)})`
			: album.name;

		const progressFillStyle = new Style({
			backgroundColor: theme.colors.bgAccent,
			bottom: 0,
			left: 0,
			position: 'absolute',
			top: 0,
			width: `${Math.round(progressRatio * 100)}%`,
		});

		const expandedProgressFillStyle = new Style({
			backgroundColor: accentColor,
			borderRadius: 2,
			height: '100%',
			width: `${Math.round(progressRatio * 100)}%`,
		});

		const rootStyle = this.state.isExpanded ? styles.rootExpanded : styles.rootCollapsed;

		<view style={rootStyle}>
			{/* biome-ignore lint/a11y/noStaticElementInteractions: Intentional interactive compact now-playing surface. */}
			<view
				id='now-playing-surface-bar'
				onDrag={this.handleCompactDrag}
				onTap={this.openSurface}
				ref={this.compactBarRef}
				style={styles.bar}
			>
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
			</view>

			<view id='now-playing-surface-overlay' ref={this.overlayRef} style={styles.overlayRoot}>
				{/* biome-ignore lint/a11y/noStaticElementInteractions: Intentional swipe-down gesture handler for collapse. */}
				<view
					onDrag={this.handleExpandedDrag}
					onTouch={this.handleExpandedTouch}
					ref={this.overlayCardRef}
					style={styles.overlayCard}
				>
					{album.imageUrl && (
						<image
							objectFit='cover'
							ref={this.transitionArtworkRef}
							src={album.imageUrl}
							style={styles.transitionArtwork}
						/>
					)}
					<view ref={this.expandedContentRef} style={styles.expandedContent}>
						<layout style={styles.expandedInner}>
							<layout style={styles.expandedArtworkSpacer} />
							<layout style={styles.expandedInfoSection}>
								{artistLogoUrl && (
									<image
										objectFit='contain'
										src={artistLogoUrl}
										style={styles.expandedArtistLogo}
									/>
								)}
								{!artistLogoUrl && (
									<label style={styles.expandedArtistName} value={album.artistName} />
								)}
							</layout>
							<layout style={styles.expandedBottomSection}>
								<layout style={styles.expandedTrackMetaSection}>
									<label numberOfLines={2} style={styles.expandedTrackName} value={track.name} />
									<label numberOfLines={2} style={styles.expandedAlbumLine} value={albumLine} />
								</layout>
								<layout style={styles.expandedProgressSection}>
									<view style={styles.expandedProgressTrack}>
										<view style={expandedProgressFillStyle} />
									</view>
									<layout style={styles.expandedTimeRow}>
										<label style={styles.expandedTimeLabel} value={elapsedText} />
										<label style={styles.expandedTimeLabel} value={remainingText} />
									</layout>
								</layout>
								<layout style={styles.expandedControlsRow}>
									<view onTap={onPrevious} style={styles.expandedControlButton}>
										<image
											src={res.previous}
											style={styles.expandedControlIcon}
											tint={accentColor}
										/>
									</view>
									<view onTap={onPlayPause} style={styles.expandedPlayButton}>
										<image
											src={isPlaying ? res.pause : res.play}
											style={styles.expandedPlayIcon}
											tint={accentColor}
										/>
									</view>
									<view onTap={onNext} style={styles.expandedControlButton}>
										<image src={res.next} style={styles.expandedControlIcon} tint={accentColor} />
									</view>
								</layout>
								<layout style={styles.expandedQueueTabsRow}>
									<view style={styles.expandedQueueTabButton}>
										<label style={styles.expandedQueueTabLabel} value='BACK TO' />
									</view>
									<view style={styles.expandedQueueTabButton}>
										<label style={styles.expandedQueueTabLabel} value='UP NEXT' />
									</view>
								</layout>
							</layout>
						</layout>
					</view>
				</view>
			</view>
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
		zIndex: 25,
	}),
	expandedAlbumLine: new Style<Label>({
		...theme.text.sub,
		marginTop: 4,
		textAlign: 'center',
		width: '100%',
	}),
	expandedArtistLogo: new Style<ImageView>({
		height: 48,
		marginBottom: 8,
		objectFit: 'contain',
		width: '100%',
	}),
	expandedArtistName: new Style<Label>({
		...theme.text.mutedHeader,
		marginBottom: 8,
		textAlign: 'center',
		width: '100%',
	}),
	expandedArtworkSpacer: new Style({
		aspectRatio: 1,
		width: '100%',
	}),
	expandedBottomSection: new Style({
		marginBottom: theme.footerHeight - 24,
		marginTop: 'auto',
		width: '100%',
	}),
	expandedContent: new Style({
		backgroundColor: theme.colors.bgDeep,
		bottom: 0,
		height: '100%',
		left: 14,
		opacity: 0,
		position: 'absolute',
		right: 14,
		top: 52,
	}),
	expandedControlButton: new Style({
		alignItems: 'center',
		justifyContent: 'center',
		padding: 16,
	}),
	expandedControlIcon: new Style<ImageView>({
		height: 35,
		width: 35,
	}),
	expandedControlsRow: new Style({
		alignItems: 'center',
		flexDirection: 'row',
		justifyContent: 'center',
		marginBottom: 12,
		marginTop: 12,
		width: '100%',
	}),
	expandedInfoSection: new Style({
		alignItems: 'center',
		flexGrow: 1,
		justifyContent: 'center',
		paddingHorizontal: 24,
		width: '100%',
	}),
	expandedInner: new Style({
		flexGrow: 1,
		height: '100%',
		width: '100%',
	}),
	expandedPlayButton: new Style({
		alignItems: 'center',
		justifyContent: 'center',
		padding: 16,
	}),
	expandedPlayIcon: new Style<ImageView>({
		height: 45,
		width: 45,
	}),
	expandedProgressSection: new Style({
		marginTop: 4,
		paddingLeft: 30,
		paddingRight: 30,
		width: '100%',
	}),
	expandedProgressTrack: new Style({
		backgroundColor: theme.colors.bgAccent,
		borderRadius: 2,
		height: 4,
		marginTop: 10,
		overflow: 'hidden',
		width: '100%',
	}),
	expandedQueueTabButton: new Style({
		alignItems: 'center',
		flexGrow: 1,
		justifyContent: 'flex-end',
		paddingTop: 4,
	}),
	expandedQueueTabLabel: new Style<Label>({
		...theme.text.sub,
		textAlign: 'center',
	}),
	expandedQueueTabsRow: new Style({
		borderTopColor: theme.colors.bgAccent,
		borderTopWidth: 1,
		flexDirection: 'row',
		width: '100%',
	}),
	expandedTimeLabel: new Style<Label>({
		...theme.text.sub,
	}),
	expandedTimeRow: new Style({
		flexDirection: 'row',
		justifyContent: 'space-between',
		marginTop: 6,
		width: '100%',
	}),
	expandedTrackMetaSection: new Style({
		alignItems: 'center',
		marginBottom: 10,
		paddingHorizontal: 24,
		width: '100%',
	}),
	expandedTrackName: new Style<Label>({
		...theme.text.main,
		textAlign: 'center',
		width: '100%',
	}),
	info: new Style({
		flexGrow: 1,
		flexShrink: 1,
		justifyContent: 'center',
		marginRight: 12,
	}),
	overlayCard: new Style({
		backgroundColor: theme.colors.bgDeep,
		borderRadius: theme.borderRadius,
		bottom: theme.footerHeight * 0.8,
		height: 84,
		left: 20,
		overflow: 'hidden',
		position: 'absolute',
		right: 20,
	}),
	overlayRoot: new Style({
		height: '100%',
		left: 0,
		position: 'absolute',
		right: 0,
		top: 2000,
		zIndex: 30,
	}),
	rootCollapsed: new Style({
		bottom: 0,
		height: 180,
		left: 0,
		position: 'absolute',
		right: 0,
		width: '100%',
	}),
	rootExpanded: new Style({
		height: '100%',
		left: 0,
		position: 'absolute',
		right: 0,
		top: 0,
		width: '100%',
	}),
	time: new Style<Label>({
		...theme.text.sub,
		flexShrink: 0,
		paddingRight: 10,
	}),
	trackName: new Style<Label>({
		...theme.text.mainBold,
	}),
	transitionArtwork: new Style<ImageView>({
		aspectRatio: 1,
		borderRadius: 8,
		left: 12,
		position: 'absolute',
		top: 10,
		width: 65,
		zIndex: 40,
	}),
};
