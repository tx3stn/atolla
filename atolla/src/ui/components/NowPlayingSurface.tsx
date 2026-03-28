// @ts-nocheck
import res from 'atolla/res';
import { StatefulComponent } from 'valdi_core/src/Component';
import { ElementRef } from 'valdi_core/src/ElementRef';
import { Style } from 'valdi_core/src/Style';
import { TouchEventState } from 'valdi_tsx/src/GestureEvents';
import type { ImageView, Label } from 'valdi_tsx/src/NativeTemplateElements';
import type { Album } from '../../models/Album';
import type { Track } from '../../models/Track';
import { NEUTRAL_PALETTE, type Palette } from '../../services/color/types';
import type { ImageCache } from '../../services/ImageCache';
import { buildImageSource } from '../../services/ImageSource';
import type { PlaybackStore } from '../../stores/Playback';
import { theme } from '../../theme';
import type { Transport } from '../../transports/Transport';
import { ArtistLogo } from './ArtistLogo';
import { PlaybackProgressBar } from './PlaybackProgressBar';
import { Toast } from './Toast';
import { TrackContextMenu } from './TrackContextMenu';
import { TrackList, type TrackListEntry } from './TrackList';

export interface NowPlayingSurfaceViewModel {
	album: Album | null;
	animationsEnabled: boolean;
	artistLogoUrl?: string | null;
	collapseSignal: number;
	imageCache?: ImageCache;
	isPlaying: boolean;
	onArtistTap?: () => void;
	onDismiss: () => void;
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
	private transitionArtworkRef = new ElementRef();
	private scrollArtworkRef = new ElementRef();
	private touchStartX = 0;
	private touchStartY = 0;
	private isTransitioning = false;

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

	private runAnimate(options: object, callback: () => void): void {
		if (this.viewModel.animationsEnabled) {
			this.animate(options, callback);
		} else {
			callback();
		}
	}

	private runAnimatePromise(options: object, callback: () => void): Promise<void> {
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
		this.overlayRef.setAttribute('top', 0);
		this.setCollapsedGeometry();
		this.transitionArtworkRef.setAttribute('opacity', 1);

		this.runAnimatePromise(
			{ beginFromCurrentState: true, curve: 'easeOut', duration: 0.34 },
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
				this.transitionArtworkRef.setAttribute('top', 0);
				this.transitionArtworkRef.setAttribute('width', '100%');
			},
		)
			.then(() => {
				return this.runAnimatePromise(
					{ beginFromCurrentState: true, curve: 'easeOut', duration: 0.08 },
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

	private closeSurface = (): Promise<void> => {
		if (!this.state.isExpanded || this.isTransitioning) {
			return Promise.resolve();
		}

		this.isTransitioning = true;
		this.scrollArtworkRef.setAttribute('opacity', 0);
		this.transitionArtworkRef.setAttribute('opacity', 1);

		return this.runAnimatePromise(
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

	private setCollapsedGeometry(): void {
		this.compactBarRef.setAttribute('opacity', 1);
		this.overlayCardRef.setAttribute('bottom', this.collapsedBottom);
		this.overlayCardRef.setAttribute('borderRadius', theme.borderRadius / 2);
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
		this.runAnimate({ beginFromCurrentState: true, curve: 'easeOut', duration: 0.2 }, () => {
			this.overlayRef.setAttribute('top', 0);
		});
	};

	private handleQueueTabTap = (tab: QueueTab): void => {
		this.setState({ activeQueueTab: tab });
	};

	private handleTrackLongPress = (track: Track): void => {
		this.setState({ contextMenuTrack: track });
	};

	private handleContextMenuDismiss = (toastMessage?: string): void => {
		this.setState({ contextMenuTrack: null });
		if (toastMessage) {
			this.setState({ toastMessage });
			setTimeout(() => {
				this.setState({ toastMessage: null });
			}, 2000);
		}
	};

	onRender(): void {
		const {
			album,
			artistLogoUrl,
			isPlaying,
			imageCache,
			onNext,
			onPlayPause,
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
			meta: t.artistName ?? album?.artistName ?? null,
			title: t.name,
			track: t,
		});

		const upNextEntries = tracks.slice(trackIndex + 1).map(toEntry);
		const backToEntries = tracks.slice(0, trackIndex).map(toEntry);
		const activeTab = this.state.activeQueueTab;
		const albumImageUrl = album?.imageUrl ?? track.albumImageUrl ?? null;
		const albumArtworkSource =
			albumImageUrl == null ? null : buildImageSource(albumImageUrl, 'album_art');
		// The native loader generates this on demand by downscaling the cached
		// album_art to 24×24; GPU upscale to full-screen produces heavy blur.
		const blurredBgSource =
			albumImageUrl != null ? buildImageSource(albumImageUrl, 'album_art_blurred') : null;
		const artistLogoSource =
			artistLogoUrl == null ? null : buildImageSource(artistLogoUrl, 'artist_logo');

		// ── Palette-derived colours ──────────────────────────────────────────────
		const accentColor = palette.accent.hex;
		const surfaceColor = palette.surface.hex;
		const onSurfaceColor = palette.on_surface.hex;
		const mutedOnSurfaceColor = palette.muted_on_surface.hex;

		const backToLabelStyle = new Style<Label>({
			...theme.text.sub,
			color: mutedOnSurfaceColor,
			opacity: activeTab === 'backTo' ? 1 : 0.4,
			textAlign: 'center',
		});
		const upNextLabelStyle = new Style<Label>({
			...theme.text.sub,
			color: mutedOnSurfaceColor,
			opacity: activeTab === 'upNext' ? 1 : 0.4,
			textAlign: 'center',
		});

		const progressRatio = track.duration > 0 ? Math.min(progressSeconds / track.duration, 1) : 0;
		const elapsedText = formatDuration(progressSeconds);
		const remainingText = `-${formatDuration(Math.max(0, track.duration - progressSeconds))}`;
		const totalText = formatDuration(track.duration);
		const albumLine =
			album != null
				? album.releaseDate
					? `${album.name} (${album.releaseDate.slice(0, 4)})`
					: album.name
				: (track.albumName ?? '');

		// Mini-player bar: blurred artwork bg + tint overlay, accent progress fill
		const barStyle = new Style({
			alignItems: 'center',
			borderRadius: theme.borderRadius / 2,
			bottom: theme.footerHeight * 0.8,
			elevation: 18,
			flexDirection: 'row',
			left: 8,
			marginLeft: 12,
			marginRight: 12,
			overflow: 'hidden',
			position: 'absolute',
			right: 8,
			shadowColor: '#000000',
			shadowOffset: { height: 10, width: 0 },
			shadowOpacity: 0.35,
			shadowRadius: 18,
			zIndex: 25,
		});

		const expandedTrackColor = withAlpha(onSurfaceColor, 0.34);
		const compactProgressFillStyle = new Style({
			backgroundColor: accentColor,
			borderRadius: theme.borderRadius / 2,
			bottom: 0,
			left: 0,
			opacity: 0.68,
			position: 'absolute',
			right: 'auto',
			top: 0,
			width: `${Math.round(progressRatio * 100)}%`,
		});

		const bgOverlay = {
			borderRadius: theme.borderRadius / 2,
			bottom: 0,
			left: 0,
			position: 'absolute' as const,
			right: 0,
			top: 0,
		};
		// Semi-transparent surface tint over the full-bleed artwork.
		// Lower opacity lets the blurred background dominate the look.
		const expandedBgOverlayStyle = new Style({
			...bgOverlay,
			backgroundColor: withAlpha(surfaceColor, 0.45),
		});
		const compactBgOverlayStyle = new Style({
			...bgOverlay,
			backgroundColor: withAlpha(surfaceColor, 0.6),
		});

		// Expanded overlay card + content: frosted album art background
		const overlayCardStyle = new Style({
			borderRadius: theme.borderRadius,
			bottom: theme.footerHeight * 0.8,
			height: 84,
			left: 20,
			overflow: 'hidden',
			position: 'absolute',
			right: 20,
		});

		const expandedContentStyle = new Style({
			bottom: 0,
			height: '100%',
			left: 14,
			opacity: 0,
			position: 'absolute',
			right: 14,
			top: 0,
		});

		// Palette-tinted text styles
		const trackNameStyle = new Style<Label>({ ...theme.text.title, color: onSurfaceColor });
		const artistNameStyle = new Style<Label>({
			...theme.text.sub,
			color: mutedOnSurfaceColor,
			paddingTop: 4,
		});
		const timeStyle = new Style<Label>({
			...theme.text.sub,
			color: mutedOnSurfaceColor,
			flexShrink: 0,
			paddingRight: 10,
		});
		const expandedTrackNameStyle = new Style<Label>({
			...theme.text.title,
			color: onSurfaceColor,
			textAlign: 'center',
			width: '100%',
		});
		const expandedAlbumLineStyle = new Style<Label>({
			...theme.text.subLarger,
			color: mutedOnSurfaceColor,
			marginTop: 4,
			paddingTop: 12,
			textAlign: 'center',
			width: '100%',
		});
		const expandedArtistNameStyle = new Style<Label>({
			...theme.text.mutedHeader,
			color: mutedOnSurfaceColor,
			marginBottom: 8,
			textAlign: 'center',
			width: '100%',
		});
		const expandedTimeLabelStyle = new Style<Label>({
			...theme.text.sub,
			color: mutedOnSurfaceColor,
		});

		const rootStyle = this.state.isExpanded ? styles.rootExpanded : styles.rootCollapsed;

		<view style={rootStyle}>
			{/* biome-ignore lint/a11y/noStaticElementInteractions: Intentional interactive compact now-playing surface. */}
			<view
				id='now-playing-surface-bar'
				onDrag={this.handleCompactDrag}
				onTap={this.openSurface}
				ref={this.compactBarRef}
				style={barStyle}
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
					<label numberOfLines={1} style={trackNameStyle} value={track.name} />
					<label
						numberOfLines={1}
						style={artistNameStyle}
						value={track.artistName ?? album?.artistName ?? ''}
					/>
				</layout>
				<label style={timeStyle} value={`${elapsedText} / ${totalText}`} />
			</view>

			<view id='now-playing-surface-overlay' ref={this.overlayRef} style={styles.overlayRoot}>
				<view ref={this.overlayCardRef} style={overlayCardStyle}>
					{/* Layer 1: regular artwork — always visible as fallback. */}
					{albumArtworkSource && (
						<image objectFit='cover' src={albumArtworkSource} style={styles.expandedBgArtwork} />
					)}
					{/* Layer 2: 24x24 blurred PNG served via atolla-cache — GPU upscale gives heavy blur. */}
					{blurredBgSource && (
						<image objectFit='cover' src={blurredBgSource} style={styles.expandedBgArtwork} />
					)}
					<view style={expandedBgOverlayStyle} />
					{/* biome-ignore lint/a11y/noStaticElementInteractions: Dedicated gesture zone for swipe-down collapse. */}
					<view
						onDrag={this.handleExpandedDrag}
						onTouch={this.handleExpandedTouch}
						style={styles.expandedGestureZone}
					/>
					{albumArtworkSource && (
						<image
							objectFit='cover'
							ref={this.transitionArtworkRef}
							src={albumArtworkSource}
							style={styles.transitionArtwork}
						/>
					)}
					<view ref={this.expandedContentRef} style={expandedContentStyle}>
						<scroll style={styles.expandedInner}>
							<layout style={styles.expandedFirstPage}>
								{albumArtworkSource && (
									<image
										objectFit='cover'
										ref={this.scrollArtworkRef}
										src={albumArtworkSource}
										style={styles.expandedScrollArtwork}
									/>
								)}
								<layout style={styles.expandedInfoSection}>
									<ArtistLogo
										containerStyle={styles.expandedArtistLogoArea}
										fallbackText={album?.artistName ?? track.artistName ?? ''}
										fallbackTextStyle={expandedArtistNameStyle}
										imageCache={imageCache}
										logoSource={artistLogoSource}
										logoStyle={styles.expandedArtistLogo}
										onTap={this.handleArtistLogoTap}
										testID='now-playing-artist-logo'
									/>
								</layout>
								<layout style={styles.expandedBottomSection}>
									<layout style={styles.expandedTrackMetaSection}>
										<label numberOfLines={2} style={expandedTrackNameStyle} value={track.name} />
										<label numberOfLines={2} style={expandedAlbumLineStyle} value={albumLine} />
									</layout>
									<layout style={styles.expandedProgressSection}>
										<PlaybackProgressBar
											accentColor={accentColor}
											accessibilityLabel='now-playing-progress'
											onProgressTap={onProgressTap}
											progressRatio={progressRatio}
											thickness={4}
											trackColor={expandedTrackColor}
										/>
										<layout style={styles.expandedTimeRow}>
											<label style={expandedTimeLabelStyle} value={elapsedText} />
											<label style={expandedTimeLabelStyle} value={remainingText} />
										</layout>
									</layout>
									<layout style={styles.expandedControlsRow}>
										<view onTap={onPrevious} style={styles.expandedControlButton}>
											<image
												src={res.previous}
												style={styles.expandedControlIcon}
												tint={onSurfaceColor}
											/>
										</view>
										<view onTap={onPlayPause} style={styles.expandedPlayButton}>
											<image
												src={isPlaying ? res.pause : res.play}
												style={styles.expandedPlayIcon}
												tint={onSurfaceColor}
											/>
										</view>
										<view onTap={onNext} style={styles.expandedControlButton}>
											<image
												src={res.next}
												style={styles.expandedControlIcon}
												tint={onSurfaceColor}
											/>
										</view>
									</layout>
									<layout style={styles.expandedQueueTabsRow}>
										<view
											onTap={() => this.handleQueueTabTap('backTo')}
											style={styles.expandedQueueTabButton}
										>
											<label style={backToLabelStyle} value='BACK TO' />
										</view>
										<view
											onTap={() => this.handleQueueTabTap('upNext')}
											style={styles.expandedQueueTabButton}
										>
											<label style={upNextLabelStyle} value='UP NEXT' />
										</view>
									</layout>
								</layout>
							</layout>
							<layout style={styles.expandedQueueList}>
								<TrackList
									imageCache={imageCache}
									noRowBackground
									onTrackLongPress={
										this.viewModel.playbackStore && this.viewModel.transport
											? this.handleTrackLongPress
											: undefined
									}
									onTrackTap={onTrackTap}
									palette={palette}
									tracks={activeTab === 'upNext' ? upNextEntries : backToEntries}
								/>
							</layout>
						</scroll>
					</view>
				</view>
			</view>
			{this.state.contextMenuTrack && this.viewModel.playbackStore && this.viewModel.transport && (
				<TrackContextMenu
					imageCache={imageCache}
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

function withAlpha(hexColor: string, alpha: number): string {
	const hex = hexColor.replace('#', '');
	const r = Number.parseInt(hex.slice(0, 2), 16);
	const g = Number.parseInt(hex.slice(2, 4), 16);
	const b = Number.parseInt(hex.slice(4, 6), 16);
	const normalizedAlpha = Math.max(0, Math.min(1, alpha));
	return `rgba(${r},${g},${b},${normalizedAlpha})`;
}

const styles = {
	artwork: new Style<ImageView>({
		borderRadius: theme.borderRadius / 2,
		flexShrink: 0,
		height: 65,
		marginRight: 14,
		width: 65,
	}),
	compactBgArtwork: new Style<ImageView>({
		borderRadius: theme.borderRadius / 2,
		bottom: 0,
		left: 0,
		position: 'absolute',
		right: 0,
		top: 0,
	}),
	compactProgressContainer: new Style({
		borderRadius: theme.borderRadius / 2,
		bottom: 0,
		left: 0,
		position: 'absolute',
		right: 0,
		top: 0,
	}),
	expandedArtistLogo: new Style<ImageView>({
		height: 48,
		marginBottom: 8,
		objectFit: 'contain',
		width: '100%',
	}),
	expandedArtistLogoArea: new Style({
		width: '100%',
	}),
	expandedBgArtwork: new Style<ImageView>({
		bottom: 0,
		left: 0,
		position: 'absolute',
		right: 0,
		top: 0,
	}),
	expandedBottomSection: new Style({
		marginBottom: theme.footerHeight - 24,
		marginTop: 'auto',
		width: '100%',
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
	expandedFirstPage: new Style({
		minHeight: '100%',
		width: '100%',
	}),
	expandedGestureZone: new Style({
		height: 170,
		left: 0,
		position: 'absolute',
		right: 0,
		top: 0,
		zIndex: 90,
	}),
	expandedInfoSection: new Style({
		alignItems: 'center',
		flexGrow: 1,
		justifyContent: 'center',
		paddingHorizontal: 24,
		width: '100%',
	}),
	expandedInner: new Style({
		flex: 1,
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
	expandedQueueList: new Style({
		marginTop: -(theme.footerHeight - 24),
		paddingBottom: theme.footerHeight,
		paddingHorizontal: 14,
		width: '100%',
	}),
	expandedQueueTabButton: new Style({
		alignItems: 'center',
		flexGrow: 1,
		justifyContent: 'flex-end',
		paddingTop: 4,
	}),
	expandedQueueTabsRow: new Style({
		borderTopColor: theme.colors.bgAccent,
		borderTopWidth: 1,
		flexDirection: 'row',
		padding: 10,
		width: '100%',
	}),
	expandedScrollArtwork: new Style<ImageView>({
		aspectRatio: 1,
		opacity: 0,
		width: '100%',
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
	info: new Style({
		flexGrow: 1,
		flexShrink: 1,
		justifyContent: 'center',
		marginRight: 12,
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
	transitionArtwork: new Style<ImageView>({
		aspectRatio: 1,
		borderRadius: theme.borderRadius,
		left: 12,
		position: 'absolute',
		top: 10,
		width: 65,
		zIndex: 40,
	}),
};
