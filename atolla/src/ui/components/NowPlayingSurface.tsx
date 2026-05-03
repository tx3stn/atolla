import res from 'atolla/res';
import { AnimationCurve, type AnimationOptions } from 'valdi_core/src/AnimationOptions';
import { StatefulComponent } from 'valdi_core/src/Component';
import { ElementRef } from 'valdi_core/src/ElementRef';
import { Style } from 'valdi_core/src/Style';
import type { DragEvent } from 'valdi_tsx/src/GestureEvents';
import type { ImageView, Label, Layout, View } from 'valdi_tsx/src/NativeTemplateElements';
import type { Album } from '../../models/Album';
import type { Track } from '../../models/Track';
import Strings from '../../Strings';
import { NEUTRAL_PALETTE, type Palette } from '../../services/color/types';
import type { ImageCache } from '../../services/ImageCache';
import { buildImageSource } from '../../services/ImageSource';
import { type LoopMode, LoopModes, type PlaybackStore } from '../../stores/Playback';
import { theme, topInset, withAlpha } from '../../theme';
import type { Transport } from '../../transports/Transport';
import { ArtistLogo } from './ArtistLogo';
import { ProgressBarWaveform } from './ProgressBarWaveform';
import { TappableIcon } from './TappableIcon';
import { Toast } from './Toast';
import { TouchEventState } from './TouchEventState';
import { TrackContextMenu } from './TrackContextMenu';
import { TrackList, type TrackListEntry } from './TrackList';
import { clearScheduledToast, scheduleToastDismiss } from './toastTimer';

const MAX_VISIBLE_QUEUE_TRACKS = 30;

export interface NowPlayingSurfaceViewModel {
	album: Album | null;
	animationsEnabled: boolean;
	artistLogoUrl?: string | null;
	collapseSignal: number;
	imageCache?: ImageCache;
	isPlaying: boolean;
	language?: string;
	loopMode?: LoopMode;
	onAlbumTap?: () => void;
	onArtistTap?: () => void;
	onDismiss: () => void;
	onLoopModeToggle?: () => void;
	onNext: () => void;
	onPlayPause: () => void;
	onPrevious: () => void;
	onProgressTap?: (ratio?: number) => void;
	onTrackTap?: (trackId: string) => void;
	palette?: Palette;
	playbackStore?: PlaybackStore;
	progressSeconds: number;
	track: Track;
	trackIndex: number;
	tracks: Array<Track>;
	transport?: Transport;
	waveformMaskUrl?: string | null;
}

type QueueTab = 'backTo' | 'upNext';

interface NowPlayingSurfaceState {
	activeQueueTab: QueueTab;
	contextMenuTrack: Track | null;
	isExpanded: boolean;
	toastMessage: string | null;
}

export class NowPlayingSurface extends StatefulComponent<
	NowPlayingSurfaceViewModel,
	NowPlayingSurfaceState
> {
	private overlayRef = new ElementRef();
	private overlayCardRef = new ElementRef();
	private compactBarRef = new ElementRef();
	private expandedContentRef = new ElementRef();
	private expandedScrollRef = new ElementRef();
	private transitionArtworkRef = new ElementRef();
	private scrollArtworkRef = new ElementRef();
	private isTransitioning = false;
	private toastTimerId?: ReturnType<typeof setTimeout>;

	private readonly closeDragDistance = 36;
	private readonly closeDragVelocity = 550;
	private readonly collapsedInset = 20;
	private readonly collapsedBottom = theme.footerHeight * 0.8;
	private readonly collapsedHeight = 84;

	state: NowPlayingSurfaceState = {
		activeQueueTab: 'upNext',
		contextMenuTrack: null,
		isExpanded: false,
		toastMessage: null,
	};

	private runAnimate(options: AnimationOptions, callback: () => void): void {
		if (this.viewModel.animationsEnabled) {
			this.animate(options, callback);
		} else {
			callback();
		}
	}

	private runAnimatePromise(options: AnimationOptions, callback: () => void): Promise<void> {
		if (this.viewModel.animationsEnabled) {
			return this.animatePromise(options, callback);
		}
		callback();
		return Promise.resolve();
	}

	private openSurface = (): void => {
		if (this.state.isExpanded || this.isTransitioning) {
			return;
		}

		this.isTransitioning = true;
		this.setState({ isExpanded: true });
		this.expandedScrollRef.setAttribute('contentOffsetY', 0);
		this.overlayRef.setAttribute('top', 0);
		this.setCollapsedGeometry();
		this.transitionArtworkRef.setAttribute('opacity', 1);

		this.runAnimatePromise(
			{ beginFromCurrentState: true, curve: AnimationCurve.EaseOut, duration: 0.34 },
			() => {
				this.compactBarRef.setAttribute('opacity', 0);
				this.overlayCardRef.setAttribute('bottom', 0);
				this.overlayCardRef.setAttribute('borderRadius', 0);
				this.overlayCardRef.setAttribute('height', '100%');
				this.overlayCardRef.setAttribute('left', 0);
				this.overlayCardRef.setAttribute('right', 0);
				this.expandedContentRef.setAttribute('left', 0);
				this.expandedContentRef.setAttribute('opacity', 0.92);
				this.expandedContentRef.setAttribute('right', 0);
				this.transitionArtworkRef.setAttribute('left', 0);
				this.transitionArtworkRef.setAttribute('marginTop', 0);
				this.transitionArtworkRef.setAttribute('top', topInset);
				this.transitionArtworkRef.setAttribute('width', '100%');
			},
		)
			.then(() => {
				return this.runAnimatePromise(
					{ beginFromCurrentState: true, curve: AnimationCurve.EaseOut, duration: 0.08 },
					() => {
						this.expandedContentRef.setAttribute('opacity', 1);
						this.transitionArtworkRef.setAttribute('opacity', 1);
					},
				);
			})
			.then(() => {
				this.transitionArtworkRef.setAttribute('opacity', 0);
				this.scrollArtworkRef.setAttribute('opacity', 1);
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

	onDestroy(): void {
		this.toastTimerId = clearScheduledToast(this.toastTimerId);
	}

	private closeSurface = (): Promise<void> => {
		if (!this.state.isExpanded || this.isTransitioning) {
			return Promise.resolve();
		}

		this.isTransitioning = true;
		this.scrollArtworkRef.setAttribute('opacity', 0);
		this.transitionArtworkRef.setAttribute('opacity', 1);

		return this.runAnimatePromise(
			{ beginFromCurrentState: true, curve: AnimationCurve.EaseIn, duration: 0.26 },
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
				this.transitionArtworkRef.setAttribute('left', 12);
				this.transitionArtworkRef.setAttribute('marginTop', 0);
				this.transitionArtworkRef.setAttribute('top', 10);
				this.transitionArtworkRef.setAttribute('width', 65);
			},
		).then(() => {
			this.overlayRef.setAttribute('top', 2000);
			this.setState({ isExpanded: false });
			this.isTransitioning = false;
		});
	};

	private handleArtistLogoTap = (): void => {
		this.closeSurface().then(() => {
			this.viewModel.onArtistTap?.();
		});
	};

	private handleContextMenuArtistTap = (): void => {
		void this.closeSurface().then(() => {
			this.viewModel.onArtistTap?.();
		});
	};

	private handleAlbumNameTap = (): void => {
		this.closeSurface().then(() => {
			this.viewModel.onAlbumTap?.();
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
		this.expandedContentRef.setAttribute('top', 0);
		this.scrollArtworkRef.setAttribute('opacity', 0);
		this.transitionArtworkRef.setAttribute('left', 12);
		this.transitionArtworkRef.setAttribute('marginTop', 0);
		this.transitionArtworkRef.setAttribute('opacity', 1);
		this.transitionArtworkRef.setAttribute('top', 10);
		this.transitionArtworkRef.setAttribute('width', 65);
	}

	private handleCompactDrag = (event: DragEvent): void => {
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
			this.runAnimatePromise({ damping: 30, stiffness: 300 }, () => {
				this.compactBarRef.setAttribute('left', 8 + offset);
				this.compactBarRef.setAttribute('right', 8 - offset);
			}).then(() => {
				this.viewModel.onDismiss();
			});
			return;
		}

		this.runAnimate({ damping: 18, stiffness: 280 }, () => {
			this.compactBarRef.setAttribute('left', 8);
			this.compactBarRef.setAttribute('right', 8);
		});
	};

	private handleExpandedDrag = (event: DragEvent): void => {
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

	private handleExpandedDragCancel = (): void => {
		this.runAnimate(
			{ beginFromCurrentState: true, curve: AnimationCurve.EaseOut, duration: 0.2 },
			() => {
				this.overlayRef.setAttribute('top', 0);
			},
		);
	};

	private handleQueueTabTap = (tab: QueueTab): void => {
		this.setState({ activeQueueTab: tab });
	};

	private handleBackToTabTap = (): void => {
		this.handleQueueTabTap('backTo');
	};

	private handleUpNextTabTap = (): void => {
		this.handleQueueTabTap('upNext');
	};

	private handleTrackLongPress = (track: Track): void => {
		this.setState({ contextMenuTrack: track });
	};

	private handleQueueTrackSwipeRemove = (_trackId: string, entryIndex: number): void => {
		const { playbackStore, trackIndex } = this.viewModel;
		if (!playbackStore?.removeFromQueueAt) {
			return;
		}

		const removeIndex =
			this.state.activeQueueTab === 'upNext'
				? trackIndex + 1 + entryIndex
				: trackIndex - 1 - entryIndex;
		playbackStore.removeFromQueueAt(removeIndex);
	};

	private handleQueueTrackReorder = (fromEntryIndex: number, toEntryIndex: number): void => {
		const { playbackStore, trackIndex } = this.viewModel;
		if (!playbackStore?.moveQueueTrack) {
			return;
		}

		const fromIndex =
			this.state.activeQueueTab === 'upNext'
				? trackIndex + 1 + fromEntryIndex
				: trackIndex - 1 - fromEntryIndex;
		const toIndex =
			this.state.activeQueueTab === 'upNext'
				? trackIndex + 1 + toEntryIndex
				: trackIndex - 1 - toEntryIndex;
		playbackStore.moveQueueTrack(fromIndex, toIndex);
	};

	private handleContextMenuDismiss = (toastMessage?: string): void => {
		this.setState({ contextMenuTrack: null });
		if (toastMessage) {
			this.toastTimerId = scheduleToastDismiss(
				this.toastTimerId,
				(message) => {
					this.setState({ toastMessage: message });
				},
				toastMessage,
			);
		}
	};

	onRender(): void {
		const {
			album,
			artistLogoUrl,
			isPlaying,
			onNext,
			onPlayPause,
			onLoopModeToggle,
			onProgressTap,
			onPrevious,
			onTrackTap,
			palette = NEUTRAL_PALETTE,
			progressSeconds,
			track,
			trackIndex,
			tracks,
		} = this.viewModel;

		const toEntry = (t: Track): TrackListEntry => ({
			artworkSource: t.albumImageUrl ?? album?.imageUrl ?? null,
			id: t.id,
			meta: t.artistName ?? '',
			title: t.name,
			track: t,
		});

		const upNextEntries = tracks
			.slice(trackIndex + 1, trackIndex + 1 + MAX_VISIBLE_QUEUE_TRACKS)
			.map(toEntry);
		const backToEntries = tracks
			.slice(Math.max(0, trackIndex - MAX_VISIBLE_QUEUE_TRACKS), trackIndex)
			.reverse()
			.map(toEntry);
		const activeTab = this.state.activeQueueTab;
		const canEditQueue = Boolean(this.viewModel.playbackStore);
		const albumImageUrl = track.albumImageUrl ?? album?.imageUrl ?? null;
		const albumArtworkSource =
			albumImageUrl == null ? null : buildImageSource(albumImageUrl, 'album_art');
		// The native loader generates this on demand by downscaling the cached
		// album_art to 24×24; GPU upscale to full-screen produces heavy blur.
		const blurredBgSource =
			albumImageUrl != null ? buildImageSource(albumImageUrl, 'album_art_blurred') : null;
		const artistLogoSource = artistLogoUrl ?? null;

		// ── Palette-derived colours ──────────────────────────────────────────────
		const accentColor = palette.accent.hex;
		const surfaceColor = palette.surface.hex;
		const onSurfaceColor = palette.on_surface.hex;
		const mutedOnSurfaceColor = palette.muted_on_surface.hex;

		const backToLabelStyle = getQueueTabLabelStyle(mutedOnSurfaceColor, activeTab === 'backTo');
		const upNextLabelStyle = getQueueTabLabelStyle(mutedOnSurfaceColor, activeTab === 'upNext');

		const progressRatio = track.duration > 0 ? Math.min(progressSeconds / track.duration, 1) : 0;
		const elapsedText = formatDuration(progressSeconds);
		const remainingText = `-${formatDuration(Math.max(0, track.duration - progressSeconds))}`;
		const totalText = formatDuration(track.duration);
		const loopMode = this.viewModel.loopMode ?? LoopModes.none;
		const loopIcon = getLoopModeIcon(loopMode);
		const trackReleaseYear =
			track.productionYear ??
			(track.releaseDate ? extractYearFromDateString(track.releaseDate) : null);
		const albumLine =
			track.albumName != null
				? trackReleaseYear
					? `${track.albumName} (${trackReleaseYear})`
					: track.albumName
				: '';

		const expandedTrackColor = withAlpha(onSurfaceColor, 0.34);
		const compactProgressFillStyle = createCompactProgressFillStyle(accentColor, progressRatio);
		const compactBgOverlayStyle = getOverlayTintStyle(surfaceColor, 0.6);
		const expandedBgOverlayStyle = getOverlayTintStyle(surfaceColor, 0.45);
		const paletteStyles = getPaletteStyles(onSurfaceColor, mutedOnSurfaceColor);

		const rootStyle = this.state.isExpanded ? styles.rootExpanded : styles.rootCollapsed;

		<view style={rootStyle}>
			<view
				accessibilityLabel='now-playing-surface-bar'
				id='now-playing-surface-bar'
				onDrag={this.handleCompactDrag}
				onTap={this.openSurface}
				ref={this.compactBarRef}
				style={styles.compactBar}
			>
				{albumArtworkSource && (
					<image objectFit='cover' src={albumArtworkSource} style={styles.compactBgArtwork} />
				)}
				{blurredBgSource && (
					<image objectFit='cover' src={blurredBgSource} style={styles.compactBgArtwork} />
				)}
				<view style={compactBgOverlayStyle} />
				<view style={styles.compactProgressContainer}>
					<view style={compactProgressFillStyle} />
				</view>
				{albumArtworkSource && (
					<image objectFit='cover' src={albumArtworkSource} style={styles.artwork} />
				)}
				<layout style={styles.info}>
					<label numberOfLines={2} style={paletteStyles.trackNameStyle} value={track.name} />
					<label
						numberOfLines={1}
						style={paletteStyles.artistNameStyle}
						value={track.artistName ?? ''}
					/>
				</layout>
				<label style={paletteStyles.timeStyle} value={`${elapsedText} / ${totalText}`} />
			</view>

			<view id='now-playing-surface-overlay' ref={this.overlayRef} style={styles.overlayRoot}>
				<view ref={this.overlayCardRef} style={styles.overlayCard}>
					{/* Layer 1: regular artwork — always visible as fallback. */}
					{albumArtworkSource && (
						<image objectFit='cover' src={albumArtworkSource} style={styles.expandedBgArtwork} />
					)}
					{/* Layer 2: 24x24 blurred PNG served via atolla-cache — GPU upscale gives heavy blur. */}
					{blurredBgSource && (
						<image objectFit='cover' src={blurredBgSource} style={styles.expandedBgArtwork} />
					)}
					<view style={expandedBgOverlayStyle} />
					{albumArtworkSource && (
						<image
							objectFit='cover'
							ref={this.transitionArtworkRef}
							src={albumArtworkSource}
							style={styles.transitionArtwork}
						/>
					)}
					<view ref={this.expandedContentRef} style={styles.expandedContent}>
						<scroll ref={this.expandedScrollRef} style={styles.expandedInner}>
							<layout style={styles.expandedFirstPage}>
								{topInset > 0 && <view style={styles.topInsetBar} />}
								{albumArtworkSource && (
									<view
										onDrag={this.handleExpandedDrag}
										onDragDisabled={!this.state.isExpanded}
										style={styles.expandedArtworkGestureZone}
									>
										<image
											objectFit='cover'
											ref={this.scrollArtworkRef}
											src={albumArtworkSource}
											style={styles.expandedScrollArtwork}
										/>
									</view>
								)}
								<layout style={styles.expandedInfoSection}>
									<ArtistLogo
										containerStyle={styles.expandedArtistLogoArea}
										fallbackText={track.artistName ?? ''}
										fallbackTextStyle={paletteStyles.expandedArtistNameStyle}
										logoSource={artistLogoSource}
										logoStyle={styles.expandedArtistLogo}
										onTap={this.handleArtistLogoTap}
									/>
								</layout>
								<layout style={styles.expandedBottomSection}>
									<view style={styles.expandedTrackMetaSection}>
										<layout style={styles.expandedTrackMetaTextInset}>
											<label
												numberOfLines={2}
												style={paletteStyles.expandedTrackNameStyle}
												value={track.name}
											/>
											<label
												numberOfLines={2}
												onTap={this.handleAlbumNameTap}
												style={paletteStyles.expandedAlbumLineStyle}
												value={albumLine}
											/>
										</layout>
									</view>
									<layout style={styles.expandedProgressSection}>
										<ProgressBarWaveform
											accentColor={accentColor}
											accessibilityLabel='now-playing-progress'
											maskImageUrl={this.viewModel.waveformMaskUrl}
											mutedColor={mutedOnSurfaceColor}
											onProgressTap={onProgressTap}
											progressRatio={progressRatio}
											thickness={4}
											trackColor={expandedTrackColor}
										/>
										<layout style={styles.expandedTimeRow}>
											<label style={paletteStyles.expandedTimeLabelStyle} value={elapsedText} />
											<label style={paletteStyles.expandedTimeLabelStyle} value={remainingText} />
										</layout>
									</layout>
									<layout style={styles.expandedControlsRow}>
										<TappableIcon
											accessibilityLabel='now-playing-loop-mode'
											animationsEnabled={this.viewModel.animationsEnabled}
											hitSize={60}
											icon={loopIcon}
											iconSize={25}
											onTap={onLoopModeToggle}
											rippleScale={1.34}
											rippleTint={withAlpha(onSurfaceColor, 0.42)}
											tint={
												loopMode === LoopModes.none
													? withAlpha(mutedOnSurfaceColor, 0.58)
													: onSurfaceColor
											}
										/>
										<TappableIcon
											accessibilityLabel='now-playing-previous'
											animationsEnabled={this.viewModel.animationsEnabled}
											hitSize={70}
											icon={res.previous}
											iconSize={38}
											onTap={onPrevious}
											rippleScale={1.34}
											rippleTint={withAlpha(onSurfaceColor, 0.42)}
											tint={onSurfaceColor}
										/>
										<TappableIcon
											accessibilityLabel='now-playing-play-pause'
											animationsEnabled={this.viewModel.animationsEnabled}
											hitSize={80}
											icon={isPlaying ? res.pause : res.play}
											iconSize={48}
											onTap={onPlayPause}
											rippleScale={1.26}
											rippleTint={withAlpha(onSurfaceColor, 0.48)}
											tint={onSurfaceColor}
										/>
										<TappableIcon
											accessibilityLabel='now-playing-next'
											animationsEnabled={this.viewModel.animationsEnabled}
											hitSize={70}
											icon={res.next}
											iconSize={38}
											onTap={onNext}
											rippleScale={1.34}
											rippleTint={withAlpha(onSurfaceColor, 0.42)}
											tint={onSurfaceColor}
										/>
										<view style={styles.controlsRowPlaceholder} />
									</layout>
									<layout style={styles.expandedQueueTabsRow}>
										<view
											accessibilityLabel='now-playing-tab-back-to'
											onTap={this.handleBackToTabTap}
											style={styles.expandedQueueTabButton}
										>
											<label style={backToLabelStyle} value={Strings.backTo()} />
										</view>
										<view
											accessibilityLabel='now-playing-tab-up-next'
											onTap={this.handleUpNextTabTap}
											style={styles.expandedQueueTabButton}
										>
											<label style={upNextLabelStyle} value={Strings.upNext()} />
										</view>
									</layout>
								</layout>
							</layout>
							<layout accessibilityLabel='now-playing-queue-list' style={styles.expandedQueueList}>
								<TrackList
									noRowBackground
									onTrackLongPress={this.handleTrackLongPress}
									onTrackReorder={canEditQueue ? this.handleQueueTrackReorder : undefined}
									onTrackSwipeRemove={canEditQueue ? this.handleQueueTrackSwipeRemove : undefined}
									onTrackTap={onTrackTap}
									palette={palette}
									showDragHandles
									tapPulseColor={palette.accent.hex}
									tracks={activeTab === 'upNext' ? upNextEntries : backToEntries}
								/>
							</layout>
						</scroll>
					</view>
				</view>
			</view>
			{this.state.contextMenuTrack && this.viewModel.playbackStore && this.viewModel.transport && (
				<TrackContextMenu
					animationsEnabled={this.viewModel.animationsEnabled}
					imageCache={this.viewModel.imageCache}
					onArtistTap={
						this.state.contextMenuTrack.artistId && this.viewModel.onArtistTap
							? this.handleContextMenuArtistTap
							: undefined
					}
					onDismiss={this.handleContextMenuDismiss}
					playbackStore={this.viewModel.playbackStore}
					track={this.state.contextMenuTrack}
					transport={this.viewModel.transport}
				/>
			)}
			{this.state.toastMessage && <Toast message={this.state.toastMessage} />}
		</view>;
	}
}

function formatDuration(seconds: number): string {
	const m = Math.floor(seconds / 60);
	const s = Math.floor(seconds % 60);
	return `${m}:${String(s).padStart(2, '0')}`;
}

function getLoopModeIcon(mode: LoopMode) {
	switch (mode) {
		case LoopModes.queue:
			return res.loopqueue;
		case LoopModes.track:
			return res.looptrack;
		default:
			return res.loopnone;
	}
}

function extractYearFromDateString(dateString: string): number | null {
	if (dateString.length < 4) {
		return null;
	}

	const yearCandidate = Number.parseInt(dateString.slice(0, 4), 10);
	if (Number.isNaN(yearCandidate)) {
		return null;
	}

	return yearCandidate;
}

interface PaletteStyles {
	artistNameStyle: Style<Label>;
	expandedAlbumLineStyle: Style<Label>;
	expandedArtistNameStyle: Style<Label>;
	expandedTimeLabelStyle: Style<Label>;
	expandedTrackNameStyle: Style<Label>;
	timeStyle: Style<Label>;
	trackNameStyle: Style<Label>;
}

const compactProgressFillStyleCache = new Map<string, Style<View>>();
const overlayTintStyleCache = new Map<string, Style<View>>();
const paletteStylesCache = new Map<string, PaletteStyles>();
const queueTabLabelStyleCache = new Map<string, Style<Label>>();

function createCompactProgressFillStyle(accentColor: string, progressRatio: number): Style<View> {
	const progressPercent = Math.round(progressRatio * 100);
	const key = `${accentColor}|${progressPercent}`;
	const cachedStyle = compactProgressFillStyleCache.get(key);
	if (cachedStyle) {
		return cachedStyle;
	}

	const createdStyle = new Style<View>({
		backgroundColor: accentColor,
		borderRadius: theme.borderRadius,
		bottom: 0,
		left: 0,
		opacity: 0.68,
		position: 'absolute',
		right: 'auto',
		top: 0,
		width: `${progressPercent}%`,
	});
	compactProgressFillStyleCache.set(key, createdStyle);
	return createdStyle;
}

function getOverlayTintStyle(surfaceColor: string, opacity: number): Style<View> {
	const key = `${surfaceColor}|${opacity}`;
	const cachedStyle = overlayTintStyleCache.get(key);
	if (cachedStyle) {
		return cachedStyle;
	}

	const createdStyle = new Style<View>({
		backgroundColor: withAlpha(surfaceColor, opacity),
		borderRadius: theme.borderRadius,
		bottom: 0,
		left: 0,
		position: 'absolute',
		right: 0,
		top: 0,
	});
	overlayTintStyleCache.set(key, createdStyle);
	return createdStyle;
}

function getQueueTabLabelStyle(color: string, isActive: boolean): Style<Label> {
	const opacity = isActive ? 1 : 0.4;
	const key = `${color}|${opacity}`;
	const cachedStyle = queueTabLabelStyleCache.get(key);
	if (cachedStyle) {
		return cachedStyle;
	}

	const createdStyle = new Style<Label>({
		...theme.text.sub,
		color,
		opacity,
		textAlign: 'center',
	});
	queueTabLabelStyleCache.set(key, createdStyle);
	return createdStyle;
}

function getPaletteStyles(onSurfaceColor: string, mutedOnSurfaceColor: string): PaletteStyles {
	const key = `${onSurfaceColor}|${mutedOnSurfaceColor}`;
	const cachedStyles = paletteStylesCache.get(key);
	if (cachedStyles) {
		return cachedStyles;
	}

	const createdStyles: PaletteStyles = {
		artistNameStyle: new Style<Label>({
			...theme.text.sub,
			color: mutedOnSurfaceColor,
			marginTop: 4,
		}),
		expandedAlbumLineStyle: new Style<Label>({
			...theme.text.subLarger,
			color: mutedOnSurfaceColor,
			marginTop: 12,
			textAlign: 'center',
			width: '100%',
		}),
		expandedArtistNameStyle: new Style<Label>({
			...theme.text.display,
			color: mutedOnSurfaceColor,
			marginBottom: 8,
			textAlign: 'center',
			width: '100%',
		}),
		expandedTimeLabelStyle: new Style<Label>({
			...theme.text.sub,
			color: mutedOnSurfaceColor,
		}),
		expandedTrackNameStyle: new Style<Label>({
			...theme.text.title,
			color: onSurfaceColor,
			textAlign: 'center',
			width: '100%',
		}),
		timeStyle: new Style<Label>({
			...theme.text.sub,
			color: mutedOnSurfaceColor,
			flexShrink: 0,
			marginRight: 10,
		}),
		trackNameStyle: new Style<Label>({
			...theme.text.title,
			color: onSurfaceColor,
		}),
	};

	paletteStylesCache.set(key, createdStyles);
	return createdStyles;
}

const styles = {
	artwork: new Style<ImageView>({
		borderRadius: theme.borderRadius,
		flexShrink: 0,
		height: 75,
		marginRight: 14,
		width: 75,
	}),
	compactBar: new Style<View>({
		alignItems: 'center',
		borderRadius: theme.borderRadius,
		bottom: theme.footerHeight * 1.2,
		boxShadow: '0 10 18 rgba(0,0,0,0.35)',
		flexDirection: 'row',
		left: 8,
		marginLeft: 10,
		marginRight: 10,
		position: 'absolute',
		right: 8,
		slowClipping: true,
		zIndex: 25,
	}),
	compactBgArtwork: new Style<ImageView>({
		borderRadius: theme.borderRadius,
		bottom: 0,
		left: 0,
		position: 'absolute',
		right: 0,
		top: 0,
	}),
	compactProgressContainer: new Style<View>({
		borderRadius: theme.borderRadius,
		bottom: 0,
		left: 50,
		position: 'absolute',
		right: 0,
		top: 0,
	}),
	controlsRowPlaceholder: new Style<View>({
		height: 62,
		width: 62,
	}),
	expandedArtistLogo: new Style<ImageView>({
		height: 70,
		marginBottom: -4,
		objectFit: 'contain',
		width: '100%',
	}),
	expandedArtistLogoArea: new Style<View>({
		width: '100%',
	}),
	expandedArtworkGestureZone: new Style<View>({
		aspectRatio: 1,
		width: '100%',
	}),
	expandedBgArtwork: new Style<ImageView>({
		bottom: 0,
		left: 0,
		position: 'absolute',
		right: 0,
		top: 0,
	}),
	expandedBottomSection: new Style<Layout>({
		marginBottom: theme.footerHeight - 24,
		marginTop: 'auto',
		width: '100%',
	}),
	expandedContent: new Style<View>({
		bottom: 0,
		height: '100%',
		left: 14,
		opacity: 0,
		position: 'absolute',
		right: 14,
		top: 0,
	}),
	expandedControlsRow: new Style<Layout>({
		alignItems: 'center',
		flexDirection: 'row',
		justifyContent: 'space-evenly',
		marginBottom: 12,
		marginTop: 12,
		width: '100%',
	}),
	expandedFirstPage: new Style<Layout>({
		minHeight: '100%',
		width: '100%',
	}),
	expandedInfoSection: new Style<Layout>({
		alignItems: 'center',
		flexGrow: 1,
		justifyContent: 'center',
		paddingLeft: 24,
		paddingRight: 24,
		width: '100%',
	}),
	expandedInner: new Style({
		flexGrow: 1,
		width: '100%',
	}),
	expandedProgressSection: new Style<Layout>({
		paddingLeft: 25,
		paddingRight: 25,
		width: '100%',
	}),
	expandedQueueList: new Style<Layout>({
		marginTop: -(theme.footerHeight - 24),
		paddingBottom: theme.footerHeight,
		paddingLeft: 6,
		paddingRight: 6,
		width: '100%',
	}),
	expandedQueueTabButton: new Style<View>({
		alignItems: 'center',
		flexGrow: 1,
		justifyContent: 'flex-end',
		paddingTop: 4,
	}),
	expandedQueueTabsRow: new Style({
		borderTopColor: theme.colors.bgAccent,
		borderTopWidth: 1,
		flexDirection: 'row' as const,
		padding: 10,
		width: '100%',
	}),
	expandedScrollArtwork: new Style<ImageView>({
		aspectRatio: 1,
		opacity: 0,
		width: '100%',
	}),
	expandedTimeRow: new Style<Layout>({
		flexDirection: 'row',
		justifyContent: 'space-between',
		marginTop: 10,
		width: '100%',
	}),
	expandedTrackMetaSection: new Style<Layout>({
		alignItems: 'center',
		marginBottom: 20,
		width: '100%',
	}),
	expandedTrackMetaTextInset: new Style<Layout>({
		alignItems: 'center',
		paddingLeft: 28,
		paddingRight: 28,
		width: '100%',
	}),
	info: new Style<Layout>({
		flexGrow: 1,
		flexShrink: 1,
		justifyContent: 'center',
		marginRight: 12,
	}),
	overlayCard: new Style<View>({
		borderRadius: theme.borderRadius,
		bottom: theme.footerHeight * 0.8,
		height: 84,
		left: 20,
		position: 'absolute',
		right: 20,
		slowClipping: true,
	}),
	overlayRoot: new Style<View>({
		height: '100%',
		left: 0,
		position: 'absolute',
		right: 0,
		top: 2000,
		zIndex: 30,
	}),
	rootCollapsed: new Style<View>({
		bottom: 0,
		height: 180,
		left: 0,
		position: 'absolute',
		right: 0,
		width: '100%',
	}),
	rootExpanded: new Style<View>({
		height: '100%',
		left: 0,
		position: 'absolute',
		right: 0,
		top: 0,
		width: '100%',
		zIndex: 20,
	}),
	topInsetBar: new Style<View>({
		backgroundColor: theme.colors.bg,
		flexShrink: 0,
		height: topInset,
		width: '100%',
	}),
	transitionArtwork: new Style<ImageView>({
		aspectRatio: 1,
		left: 12,
		position: 'absolute',
		top: 10,
		width: 65,
		zIndex: 40,
	}),
};
