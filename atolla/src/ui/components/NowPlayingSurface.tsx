import res from 'atolla/res';
import { AnimationCurve, type AnimationOptions } from 'valdi_core/src/AnimationOptions';
import { StatefulComponent } from 'valdi_core/src/Component';
import { ElementRef } from 'valdi_core/src/ElementRef';
import { Style } from 'valdi_core/src/Style';
import type { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';
import type { Asset } from 'valdi_tsx/src/Asset';
import type { ContentSizeChangeEvent, DragEvent, ScrollEvent } from 'valdi_tsx/src/GestureEvents';
import type {
	ImageView,
	Label,
	Layout,
	ScrollView,
	View,
} from 'valdi_tsx/src/NativeTemplateElements';
import type { Album } from '../../models/Album';
import type { Palette } from '../../models/Color';
import type { Playlist } from '../../models/Playlist';
import type { Track } from '../../models/Track';
import Strings from '../../Strings';
import type { ImageCache } from '../../services/ImageCache';
import { buildImageSource } from '../../services/ImageSource';
import type { ToastService } from '../../services/ToastService';
import { pagedFromArray } from '../../services/TrackSource';
import type { BarColorStore, FooterColors } from '../../stores/BarColor';
import { type LoopMode, LoopModes, type PlaybackStore } from '../../stores/Playback';
import { MAX_VISIBLE_QUEUE_TRACKS } from '../../stores/Queue';
import { paletteDefaults, theme, withAlpha } from '../../theme';
import type { Transport } from '../../transports/Transport';
import { CancelableController } from '../../utils/CancelableController';
import { createPlaylistAndAddTracks, selectQueueTracksForPlaylist } from '../flows/CreatePlaylist';
import { closeSlot, openSlot } from '../flows/ModalSlotFlow';
import { openTrackContextMenu } from '../flows/TrackContextMenu';
import { ArtistLogo } from './ArtistLogo';
import {
	CreatePlaylistFromQueueModal,
	type QueueTrackSelectionOptions,
} from './CreatePlaylistFromQueueModal';
import { FormatBadge } from './FormatBadge';
import { ProgressBarWaveform } from './ProgressBarWaveform';
import { ScrollDragAutoScroller } from './ScrollDragAutoScroller';
import { TappableIcon } from './TappableIcon';
import { TouchEventState } from './TouchEventState';
import { TrackList, type TrackListEntry } from './TrackList';

// a transition still flagged in-flight after this window was abandoned mid-animation
// by a background freeze (Valdi animations/timers stop when backgrounded, so the
// completion callback never fired). sits above the open/close animation durations so a
// genuine in-flight transition is never treated as stale
const TRANSITION_TIMEOUT_MS = 1000;

export interface NowPlayingSurfaceViewModel {
	album: Album | null;
	albumArtworkSource?: string | Asset;
	animationsEnabled: boolean;
	artistLogoUrl?: string | null;
	barColors: BarColorStore;
	blurredArtworkSource?: string | Asset;
	collapseSignal: number;
	gridColumns: number;
	imageCache: ImageCache;
	isPlaying: boolean;
	language?: string;
	loopMode?: LoopMode;
	modalSlot: DetachedSlot;
	onAlbumTap?: (track?: Track) => void;
	onArtistTap?: (track?: Track) => void;
	onOpenPlaylist?: (playlist: Playlist) => void;
	palette?: Palette;
	playbackStore?: PlaybackStore;
	toastService: ToastService;
	track: Track;
	trackIndex: number;
	tracks: Array<Track>;
	transport: Transport;
	waveformMaskUrl?: string | null;
}

type QueueTab = 'backTo' | 'upNext';

interface QueueEntries {
	backToEntries: Array<TrackListEntry>;
	upNextEntries: Array<TrackListEntry>;
}

interface NowPlayingSurfaceState {
	activeQueueTab: QueueTab;
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
	private expandedScrollRef = new ElementRef();
	private dragAutoScroller = new ScrollDragAutoScroller(this.expandedScrollRef);
	private transitionArtworkRef = new ElementRef();
	private scrollArtworkRef = new ElementRef();
	private scrollArtworkStyle = styles.expandedScrollArtwork;
	private compactFillRef = new ElementRef();
	private compactTimeLabelRef = new ElementRef();
	private expandedElapsedRef = new ElementRef();
	private expandedRemainingRef = new ElementRef();
	private queueSlideRef = new ElementRef();
	private queueListWidth: number | null = null;
	private isTransitioning = false;
	private transitionStartedAt = 0;
	private transitionGeneration = 0;
	private transitionTarget: 'expanded' | 'collapsed' | null = null;
	private isQueueSliding = false;
	private hasRendered = false;
	private playlistFlow = new CancelableController(() => this.isDestroyed());
	private unsubscribeProgress?: () => void;

	// most recent non-empty palette, held while the next track's is still extracting
	// (getPalette returns undefined until then) so the bars don't flash to defaults
	// between tracks; re-tints once the new palette is available
	private lastPalette?: Palette;

	// cached palette-derived styles, rebuilt only when palette or activeTab changes
	private cachedQueueAlbumImageUrl: string | null = null;
	private cachedQueueEntries: QueueEntries = { backToEntries: [], upNextEntries: [] };
	private cachedQueueTrackIndex = -1;
	private cachedQueueTracksSource: Array<Track> | null = null;
	private cachedCompactProgressFillStyle = createCompactProgressFillStyle(paletteDefaults.accent);
	private cachedCompactSolidBgStyle = getOverlayTintStyle(paletteDefaults.surface, 1);
	private cachedExpandedSolidBgStyle = getOverlayTintStyle(paletteDefaults.surface, 1, 0);
	private cachedCompactBgOverlayStyle = getOverlayTintStyle(paletteDefaults.surface, 0.6);
	private cachedExpandedBgOverlayStyle = getOverlayTintStyle(paletteDefaults.surface, 0.45, 0);
	private cachedPaletteStyles = getPaletteStyles(
		paletteDefaults.onSurface,
		paletteDefaults.mutedOnSurface,
	);
	private cachedBackToLabelStyle = getQueueTabLabelStyle(paletteDefaults.mutedOnSurface, false);
	private cachedUpNextLabelStyle = getQueueTabLabelStyle(paletteDefaults.mutedOnSurface, true);

	private readonly closeDragDistance = 36;
	private readonly closeDragVelocity = 550;
	private readonly collapsedInset = 20;
	private readonly collapsedBottom = theme.footerHeight * 0.8;
	private readonly collapsedHeight = 84;

	state: NowPlayingSurfaceState = {
		activeQueueTab: 'upNext',
		isExpanded: false,
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

	// palette to style from: current when available, else the last one we saw.
	// updates the held palette as a side effect when a fresh one arrives
	private resolvePalette(): Palette | undefined {
		if (this.viewModel.palette) {
			this.lastPalette = this.viewModel.palette;
		}
		return this.lastPalette;
	}

	private expandedFooterColors(): FooterColors {
		const palette = this.resolvePalette();
		return {
			activeIconColor: palette?.on_surface.hex ?? paletteDefaults.onSurface,
			background: withAlpha(palette?.surface.hex ?? paletteDefaults.surface, 0.8),
			inactiveIconColor: withAlpha(
				palette?.muted_on_surface.hex ?? paletteDefaults.mutedOnSurface,
				0.58,
			),
		};
	}

	private isStaleTransition(): boolean {
		return this.isTransitioning && Date.now() - this.transitionStartedAt > TRANSITION_TIMEOUT_MS;
	}

	// unblock a transition left in-flight by a background freeze, from the open/close
	// paths where the caller immediately re-drives the animation. invalidates the
	// abandoned chain (bumps the generation so its late completion no-ops) and clears the
	// flag; doesn't settle geometry, because the caller sets the end-state itself
	private clearStaleTransition(): void {
		if (this.isStaleTransition()) {
			this.transitionGeneration++;
			this.isTransitioning = false;
			this.transitionTarget = null;
		}
	}

	// recover a transition abandoned by a background freeze from the foreground path
	// (onViewModelUpdate), where nothing re-drives the animation. invalidate the abandoned
	// chain, then settle the surface to the end-state its lost completion would have
	// applied so colours, artwork, and isExpanded stay consistent
	private recoverStaleTransition(): void {
		if (!this.isStaleTransition()) {
			return;
		}
		this.transitionGeneration++;
		if (this.transitionTarget === 'expanded') {
			this.settleExpanded();
		} else if (this.transitionTarget === 'collapsed') {
			this.settleCollapsed();
		} else {
			this.isTransitioning = false;
			this.transitionTarget = null;
		}
	}

	private applyExpandedBarColors(): void {
		const surfaceColor = this.resolvePalette()?.surface.hex ?? paletteDefaults.surface;
		this.viewModel.barColors.setHeaderColor(surfaceColor);
		this.viewModel.barColors.setNavigationBarColor(surfaceColor);
		this.viewModel.barColors.setFooter(this.expandedFooterColors());
	}

	private applyCollapsedBarColors(): void {
		this.viewModel.barColors.resetFooter();
		this.viewModel.barColors.setNavigationBarColor(theme.colors.bg);
		this.viewModel.barColors.setHeaderColor(theme.colors.bg);
	}

	// final expanded end-state, shared by the open animation's completion and stale recovery
	// so a frozen-then-recovered open looks identical to one that animated to completion
	private settleExpanded(): void {
		this.applyExpandedBarColors();
		this.expandedContentRef.setAttribute('opacity', 1);
		this.transitionArtworkRef.setAttribute('opacity', 0);
		this.scrollArtworkStyle = styles.expandedScrollArtworkVisible;
		this.scrollArtworkRef.setAttribute('opacity', 1);
		this.isTransitioning = false;
		this.transitionTarget = null;
	}

	// final collapsed end-state, shared by the close animation's completion and stale recovery
	private settleCollapsed(): void {
		this.overlayRef.setAttribute('top', 2000);
		this.isTransitioning = false;
		this.transitionTarget = null;
		this.setState({ isExpanded: false });
	}

	private openSurface = (): void => {
		this.clearStaleTransition();
		if (this.state.isExpanded || this.isTransitioning) {
			return;
		}

		this.isTransitioning = true;
		this.transitionTarget = 'expanded';
		this.transitionStartedAt = Date.now();
		const generation = ++this.transitionGeneration;
		this.viewModel.barColors.setFooter(this.expandedFooterColors());
		this.viewModel.barColors.setNavigationBarColor(
			this.resolvePalette()?.surface.hex ?? paletteDefaults.surface,
		);
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
				this.transitionArtworkRef.setAttribute('top', theme.padding.deviceInset);
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
				if (this.isDestroyed() || generation !== this.transitionGeneration) {
					return;
				}
				this.settleExpanded();
			});
	};

	onViewModelUpdate(prevViewModel: NowPlayingSurfaceViewModel): void {
		this.recoverStaleTransition();

		if (!prevViewModel || this.viewModel.playbackStore !== prevViewModel.playbackStore) {
			this.unsubscribeProgress?.();
			this.unsubscribeProgress = this.viewModel.playbackStore?.subscribe(() => {
				this.updateProgressRefs();
			});
		}

		if (!prevViewModel) {
			this.rebuildPaletteStyles(this.resolvePalette(), this.state.activeQueueTab);
			return;
		}

		// only restyle once the new track's palette is available. while it's still extracting the
		// prop is undefined, so hold the previous palette rather than flashing the bars to defaults
		if (this.viewModel.palette && this.viewModel.palette !== prevViewModel.palette) {
			this.rebuildPaletteStyles(this.resolvePalette(), this.state.activeQueueTab);

			if (this.state.isExpanded && !this.isTransitioning) {
				this.applyExpandedBarColors();
			}
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
		if (this.state.isExpanded) {
			this.applyCollapsedBarColors();
		}
		this.unsubscribeProgress?.();
		this.playlistFlow.cancel();
	}

	private rebuildPaletteStyles(palette: Palette | undefined, activeTab: QueueTab): void {
		const accentColor = palette?.accent.hex ?? paletteDefaults.accent;
		const surfaceColor = palette?.surface.hex ?? paletteDefaults.surface;
		const onSurfaceColor = palette?.on_surface.hex ?? paletteDefaults.onSurface;
		const mutedOnSurfaceColor = palette?.muted_on_surface.hex ?? paletteDefaults.mutedOnSurface;
		this.cachedCompactProgressFillStyle = createCompactProgressFillStyle(accentColor);
		this.cachedCompactSolidBgStyle = getOverlayTintStyle(surfaceColor, 1);
		this.cachedExpandedSolidBgStyle = getOverlayTintStyle(surfaceColor, 1, 0);
		this.cachedCompactBgOverlayStyle = getOverlayTintStyle(surfaceColor, 0.6);
		this.cachedExpandedBgOverlayStyle = getOverlayTintStyle(surfaceColor, 0.45, 0);
		this.cachedPaletteStyles = getPaletteStyles(onSurfaceColor, mutedOnSurfaceColor);
		this.cachedBackToLabelStyle = getQueueTabLabelStyle(
			mutedOnSurfaceColor,
			activeTab === 'backTo',
		);
		this.cachedUpNextLabelStyle = getQueueTabLabelStyle(
			mutedOnSurfaceColor,
			activeTab === 'upNext',
		);
	}

	private updateProgressRefs(): void {
		if (this.isDestroyed() || !this.hasRendered) return;
		const { playbackStore } = this.viewModel;
		if (!playbackStore?.track) return;
		const progressSeconds = playbackStore.progressSeconds;
		const duration = playbackStore.track.duration;
		const ratio = duration > 0 ? Math.min(progressSeconds / duration, 1) : 0;
		const percent = Math.round(ratio * 100);
		this.compactFillRef.setAttribute('width', `${percent}%`);
		this.compactTimeLabelRef.setAttribute(
			'value',
			`${formatDuration(progressSeconds)} / ${formatDuration(duration)}`,
		);
		this.expandedElapsedRef.setAttribute('value', formatDuration(progressSeconds));
		this.expandedRemainingRef.setAttribute(
			'value',
			`-${formatDuration(Math.max(0, duration - progressSeconds))}`,
		);
	}

	private closeSurface = (): Promise<void> => {
		this.clearStaleTransition();
		if (!this.state.isExpanded || this.isTransitioning) {
			return Promise.resolve();
		}

		this.applyCollapsedBarColors();

		this.isTransitioning = true;
		this.transitionTarget = 'collapsed';
		this.transitionStartedAt = Date.now();
		const generation = ++this.transitionGeneration;
		this.scrollArtworkStyle = styles.expandedScrollArtwork;
		this.scrollArtworkRef.setAttribute('opacity', 0);
		this.transitionArtworkRef.setAttribute('opacity', 1);

		return this.runAnimatePromise(
			{ beginFromCurrentState: true, curve: AnimationCurve.EaseIn, duration: 0.26 },
			() => {
				this.overlayRef.setAttribute('top', 0);
				this.compactBarRef.setAttribute('opacity', 1);
				this.overlayCardRef.setAttribute('bottom', this.collapsedBottom);
				this.overlayCardRef.setAttribute('borderRadius', theme.radius.default);
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
			if (this.isDestroyed() || generation !== this.transitionGeneration) {
				return;
			}
			this.settleCollapsed();
		});
	};

	private handleArtistLogoTap = (): void => {
		this.closeSurface().then(() => {
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
		this.overlayCardRef.setAttribute('borderRadius', theme.radius.default);
		this.overlayCardRef.setAttribute('height', this.collapsedHeight);
		this.overlayCardRef.setAttribute('left', this.collapsedInset);
		this.overlayCardRef.setAttribute('right', this.collapsedInset);
		this.expandedContentRef.setAttribute('left', 14);
		this.expandedContentRef.setAttribute('opacity', 0);
		this.expandedContentRef.setAttribute('right', 14);
		this.expandedContentRef.setAttribute('top', 0);
		this.scrollArtworkStyle = styles.expandedScrollArtwork;
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
				if (this.isDestroyed()) return;
				this.handleDismiss();
			});
			return;
		}

		this.runAnimate({ damping: 18, stiffness: 280 }, () => {
			this.compactBarRef.setAttribute('left', 8);
			this.compactBarRef.setAttribute('right', 8);
		});
	};

	private handleExpandedContentSizeChange = (size: ContentSizeChangeEvent): void => {
		this.dragAutoScroller.setContentHeight(size.height);
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

	private handleExpandedScroll = (event: ScrollEvent): void => {
		this.dragAutoScroller.setOffset(event.y);
	};

	private getQueueEntries(
		tracks: Array<Track>,
		trackIndex: number,
		albumImageUrl: string | null,
	): QueueEntries {
		if (
			tracks === this.cachedQueueTracksSource &&
			trackIndex === this.cachedQueueTrackIndex &&
			albumImageUrl === this.cachedQueueAlbumImageUrl
		) {
			return this.cachedQueueEntries;
		}

		this.cachedQueueTracksSource = tracks;
		this.cachedQueueTrackIndex = trackIndex;
		this.cachedQueueAlbumImageUrl = albumImageUrl;

		const toEntry = (t: Track): TrackListEntry => ({
			artworkSource: t.albumImageUrl ?? albumImageUrl,
			id: t.id,
			meta: t.artistName ?? '',
			title: t.name,
			track: t,
		});

		this.cachedQueueEntries = {
			backToEntries: tracks
				.slice(Math.max(0, trackIndex - MAX_VISIBLE_QUEUE_TRACKS), trackIndex)
				.reverse()
				.map(toEntry),
			upNextEntries: tracks
				.slice(trackIndex + 1, trackIndex + 1 + MAX_VISIBLE_QUEUE_TRACKS)
				.map(toEntry),
		};
		return this.cachedQueueEntries;
	}

	private handleQueuePageLayout = (frame: { width: number }): void => {
		this.queueListWidth = frame.width;
		if (!this.isQueueSliding) {
			const targetLeft = this.state.activeQueueTab === 'upNext' ? -frame.width : 0;
			this.queueSlideRef.setAttribute('left', targetLeft);
		}
	};

	private handleQueueTabTap = (tab: QueueTab): void => {
		if (tab === this.state.activeQueueTab || this.isQueueSliding) return;
		const mutedOnSurfaceColor =
			this.resolvePalette()?.muted_on_surface.hex ?? paletteDefaults.mutedOnSurface;
		this.cachedBackToLabelStyle = getQueueTabLabelStyle(mutedOnSurfaceColor, tab === 'backTo');
		this.cachedUpNextLabelStyle = getQueueTabLabelStyle(mutedOnSurfaceColor, tab === 'upNext');
		this.setState({ activeQueueTab: tab });
		// Back To is the left page (left=0), Up Next is the right page (left=-pageWidth)
		const targetLeft = tab === 'upNext' ? -(this.queueListWidth ?? 0) : 0;
		if (!this.viewModel.animationsEnabled || this.queueListWidth == null) {
			this.queueSlideRef.setAttribute('left', targetLeft);
			return;
		}

		this.isQueueSliding = true;
		this.runAnimatePromise({ curve: AnimationCurve.EaseInOut, duration: 0.28 }, () => {
			this.queueSlideRef.setAttribute('left', targetLeft);
		}).then(() => {
			this.isQueueSliding = false;
		});
	};

	private handleBackToTabTap = (): void => {
		this.handleQueueTabTap('backTo');
	};

	private handleUpNextTabTap = (): void => {
		this.handleQueueTabTap('upNext');
	};

	private handleTrackLongPress = (track: Track): void => {
		const { onAlbumTap, onArtistTap, playbackStore } = this.viewModel;
		if (!playbackStore) {
			return;
		}
		openTrackContextMenu(track, this.viewModel.modalSlot, {
			animationsEnabled: this.viewModel.animationsEnabled,
			gridColumns: this.viewModel.gridColumns,
			imageCache: this.viewModel.imageCache,
			onAlbumTap:
				track.albumId && onAlbumTap
					? () => void this.closeSurface().then(() => onAlbumTap(track))
					: undefined,
			onArtistTap:
				track.artistId && onArtistTap
					? () => void this.closeSurface().then(() => onArtistTap(track))
					: undefined,
			onDismiss: (toastMessage?: string) => {
				if (toastMessage) {
					this.viewModel.toastService.show(toastMessage);
				}
			},
			onPlaylistCreated: (playlist) => {
				void this.closeSurface().then(() => this.viewModel.onOpenPlaylist?.(playlist));
			},
			playbackStore,
			toastService: this.viewModel.toastService,
			transport: this.viewModel.transport,
		});
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

	private handleCreatePlaylistFromQueue = (): void => {
		openSlot(this.viewModel.modalSlot, () => {
			<CreatePlaylistFromQueueModal
				animationsEnabled={this.viewModel.animationsEnabled}
				onCancel={this.handleCreatePlaylistFromQueueCancel}
				onCreate={this.handleCreatePlaylistFromQueueConfirm}
			/>;
		});
	};

	private handleCreatePlaylistFromQueueCancel = (): void => {
		closeSlot(this.viewModel.modalSlot);
	};

	private handleCreatePlaylistFromQueueConfirm = async (
		name: string,
		options: QueueTrackSelectionOptions,
	): Promise<void> => {
		const { tracks, trackIndex, transport } = this.viewModel;
		const selected = selectQueueTracksForPlaylist(tracks, trackIndex, options);
		try {
			const { alive, value: playlist } = await this.playlistFlow.run(
				createPlaylistAndAddTracks(
					name,
					(playlistName) => transport.createPlaylist(playlistName),
					(playlistId, trackIds) => transport.addItemsToPlaylist(playlistId, trackIds),
					pagedFromArray(selected),
					{ isCancelled: () => this.isDestroyed() },
				),
			);
			if (!alive) return;
			closeSlot(this.viewModel.modalSlot);
			await this.closeSurface();
			this.viewModel.onOpenPlaylist?.(playlist);
		} catch {
			if (this.isDestroyed()) return;
			closeSlot(this.viewModel.modalSlot);
		}
	};

	private handleNext = (): void => {
		this.viewModel.playbackStore?.next();
	};

	private handlePlayPause = (): void => {
		this.viewModel.playbackStore?.playPause();
	};

	private handlePrevious = (): void => {
		this.viewModel.playbackStore?.previousOrRestart();
	};

	private handleLoopModeToggle = (): void => {
		this.viewModel.playbackStore?.cycleLoopMode();
	};

	private handleDismiss = (): void => {
		this.viewModel.playbackStore?.stop();
	};

	private handleProgressTap = (ratio?: number): void => {
		const playbackStore = this.viewModel.playbackStore;
		const activeTrack = playbackStore?.track;
		if (!playbackStore || !activeTrack) {
			return;
		}
		if (typeof ratio === 'number') {
			playbackStore.seekTo(activeTrack.duration * ratio);
			return;
		}
		playbackStore.skipForward(10);
	};

	private handleTrackTap = (trackId: string): void => {
		const playbackStore = this.viewModel.playbackStore;
		if (!playbackStore) {
			return;
		}
		const index = playbackStore.tracks.findIndex((t) => t.id === trackId);
		if (index !== -1) {
			playbackStore.jumpToIndex(index);
		}
	};

	onRender(): void {
		this.hasRendered = true;
		const { album, artistLogoUrl, isPlaying, track, trackIndex, tracks } = this.viewModel;

		if (!track) return;

		// hold the previous track's palette until the new one is extracted so colours don't flash
		const palette = this.resolvePalette();

		const playbackStore = this.viewModel.playbackStore;
		const progressSeconds = playbackStore?.progressSeconds ?? 0;

		const { backToEntries, upNextEntries } = this.getQueueEntries(
			tracks,
			trackIndex,
			album?.imageUrl ?? null,
		);
		const canEditQueue = Boolean(this.viewModel.playbackStore);
		const albumImageUrl = track.albumImageUrl ?? album?.imageUrl ?? null;
		const albumArtworkSource =
			this.viewModel.albumArtworkSource ??
			(albumImageUrl == null ? null : buildImageSource(albumImageUrl, 'album_art'));
		// the native loader generates this on demand by downscaling the cached album_art to
		// 24×24; GPU upscale to full-screen produces heavy blur
		const blurredBgSource =
			this.viewModel.blurredArtworkSource ??
			(albumImageUrl != null ? buildImageSource(albumImageUrl, 'album_art_blurred') : null);
		const artistLogoSource = artistLogoUrl ?? null;

		// ── Palette-derived colours ──────────────────────────────────────────────
		const accentColor = palette?.accent.hex ?? paletteDefaults.accent;
		const surfaceColor = palette?.surface.hex ?? paletteDefaults.surface;
		const onSurfaceColor = palette?.on_surface.hex ?? paletteDefaults.onSurface;
		const mutedOnSurfaceColor = palette?.muted_on_surface.hex ?? paletteDefaults.mutedOnSurface;

		const elapsedText = formatDuration(progressSeconds);
		const remainingText = `-${formatDuration(Math.max(0, track.duration - progressSeconds))}`;
		const totalText = formatDuration(track.duration);
		const loopMode = this.viewModel.loopMode ?? LoopModes.none;
		const loopIcon = getLoopModeIcon(loopMode);
		const releaseDateSource = track.releaseDate ?? album?.releaseDate;
		const trackReleaseYear =
			track.productionYear ??
			(releaseDateSource ? extractYearFromDateString(releaseDateSource) : null);
		const albumLine =
			track.albumName != null
				? trackReleaseYear
					? `${track.albumName} (${trackReleaseYear})`
					: track.albumName
				: '';

		const expandedTrackColor = withAlpha(onSurfaceColor, 0.34);
		const backToLabelStyle = this.cachedBackToLabelStyle;
		const upNextLabelStyle = this.cachedUpNextLabelStyle;
		const compactProgressFillStyle = this.cachedCompactProgressFillStyle;
		const compactSolidBgStyle = this.cachedCompactSolidBgStyle;
		const expandedSolidBgStyle = this.cachedExpandedSolidBgStyle;
		const compactBgOverlayStyle = this.cachedCompactBgOverlayStyle;
		const expandedBgOverlayStyle = this.cachedExpandedBgOverlayStyle;
		const paletteStyles = this.cachedPaletteStyles;

		const rootStyle = this.state.isExpanded ? styles.rootExpanded : styles.rootCollapsed;

		<view style={rootStyle}>
			<view
				accessibilityId='now-playing-surface-bar'
				accessibilityLabel='now-playing-surface-bar'
				id='now-playing-surface-bar'
				onDrag={this.handleCompactDrag}
				onTap={this.openSurface}
				ref={this.compactBarRef}
				style={styles.compactBar}
			>
				<view style={compactSolidBgStyle} />
				{albumArtworkSource && (
					<image objectFit='cover' src={albumArtworkSource} style={styles.compactBgArtwork} />
				)}
				{blurredBgSource && (
					<image objectFit='cover' src={blurredBgSource} style={styles.compactBgArtwork} />
				)}
				<view style={compactBgOverlayStyle} />
				<view style={styles.compactProgressContainer}>
					<view
						accessibilityId='now-playing-compact-progress-fill'
						accessibilityLabel='now-playing-compact-progress-fill'
						ref={this.compactFillRef}
						style={compactProgressFillStyle}
					/>
				</view>
				{albumArtworkSource && (
					<image objectFit='cover' src={albumArtworkSource} style={styles.artwork} />
				)}
				<layout style={styles.info}>
					<label
						accessibilityId='now-playing-track-name'
						numberOfLines={2}
						style={paletteStyles.trackNameStyle}
						value={track.name}
					/>
					<label
						numberOfLines={1}
						style={paletteStyles.artistNameStyle}
						value={track.artistName ?? ''}
					/>
				</layout>
				<label
					ref={this.compactTimeLabelRef}
					style={paletteStyles.timeStyle}
					value={`${elapsedText} / ${totalText}`}
				/>
			</view>

			<view id='now-playing-surface-overlay' ref={this.overlayRef} style={styles.overlayRoot}>
				<view ref={this.overlayCardRef} style={styles.overlayCard}>
					{/* layer 0: solid surface colour, visible before artwork loads or on load failure */}
					<view style={expandedSolidBgStyle} />
					{/* layer 1: regular artwork, always visible as fallback */}
					{albumArtworkSource && (
						<image objectFit='cover' src={albumArtworkSource} style={styles.expandedBgArtwork} />
					)}
					{/* layer 2: 24x24 blurred PNG via atolla-cache, GPU upscale gives heavy blur */}
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
						<scroll
							onContentSizeChange={this.handleExpandedContentSizeChange}
							onScroll={this.handleExpandedScroll}
							ref={this.expandedScrollRef}
							style={styles.expandedInner}
						>
							<layout style={styles.expandedFirstPage}>
								{theme.padding.deviceInset > 0 && (
									<view style={getTopInsetBarStyle(surfaceColor)} />
								)}
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
											style={this.scrollArtworkStyle}
										/>
									</view>
								)}
								<layout style={styles.expandedInfoSection}>
									<ArtistLogo
										accessibilityId='now-playing-artist-logo'
										containerStyle={styles.expandedArtistLogoArea}
										fallbackText={track.artistName ?? ''}
										fallbackTextStyle={paletteStyles.expandedArtistNameStyle}
										logoSource={artistLogoSource}
										logoStyle={styles.expandedArtistLogo}
										numberOfLines={2}
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
										{playbackStore && (
											<ProgressBarWaveform
												accentColor={accentColor}
												accessibilityId='now-playing-progress'
												maskImageUrl={this.viewModel.waveformMaskUrl}
												mutedColor={mutedOnSurfaceColor}
												onProgressTap={this.handleProgressTap}
												playbackStore={playbackStore}
												thickness={4}
												trackColor={expandedTrackColor}
												trackDuration={track.duration}
											/>
										)}
										<layout style={styles.expandedTimeRow}>
											<label
												ref={this.expandedElapsedRef}
												style={paletteStyles.expandedTimeLabelStyle}
												value={elapsedText}
											/>
											{track.audioFormat && (
												<view style={styles.expandedFormatCenter}>
													<FormatBadge
														backgroundColor={withAlpha(onSurfaceColor, 0.12)}
														color={mutedOnSurfaceColor}
														value={track.audioFormat}
													/>
												</view>
											)}
											<label
												ref={this.expandedRemainingRef}
												style={paletteStyles.expandedTimeLabelStyle}
												value={remainingText}
											/>
										</layout>
									</layout>
									<layout style={styles.expandedControlsRow}>
										<TappableIcon
											accessibilityId='now-playing-loop-mode'
											animationsEnabled={this.viewModel.animationsEnabled}
											hitSize={60}
											icon={loopIcon}
											iconSize={25}
											onTap={this.handleLoopModeToggle}
											rippleScale={1.34}
											rippleTint={withAlpha(onSurfaceColor, 0.42)}
											tint={
												loopMode === LoopModes.none
													? withAlpha(mutedOnSurfaceColor, 0.58)
													: onSurfaceColor
											}
										/>
										<TappableIcon
											accessibilityId='now-playing-previous'
											animationsEnabled={this.viewModel.animationsEnabled}
											hitSize={70}
											icon={res.previous}
											iconSize={38}
											onTap={this.handlePrevious}
											rippleScale={1.34}
											rippleTint={withAlpha(onSurfaceColor, 0.42)}
											tint={onSurfaceColor}
										/>
										<TappableIcon
											accessibilityId='now-playing-play-pause'
											animationsEnabled={this.viewModel.animationsEnabled}
											hitSize={80}
											icon={isPlaying ? res.pause : res.play}
											iconSize={48}
											onTap={this.handlePlayPause}
											rippleScale={1.26}
											rippleTint={withAlpha(onSurfaceColor, 0.48)}
											tint={onSurfaceColor}
										/>
										<TappableIcon
											accessibilityId='now-playing-next'
											animationsEnabled={this.viewModel.animationsEnabled}
											hitSize={70}
											icon={res.next}
											iconSize={38}
											onTap={this.handleNext}
											rippleScale={1.34}
											rippleTint={withAlpha(onSurfaceColor, 0.42)}
											tint={onSurfaceColor}
										/>
										<view style={styles.controlsRowPlaceholder} />
									</layout>
									<layout style={styles.expandedQueueTabsRow}>
										<view style={styles.queueTabsEdge}>
											<TappableIcon
												accessibilityId='now-playing-create-playlist-from-queue'
												animationsEnabled={this.viewModel.animationsEnabled}
												hitSize={44}
												icon={res.createnewplaylist}
												iconSize={20}
												onTap={this.handleCreatePlaylistFromQueue}
												rippleScale={1.34}
												rippleTint={withAlpha(onSurfaceColor, 0.42)}
												tint={mutedOnSurfaceColor}
											/>
										</view>
										<view
											accessibilityId='now-playing-tab-back-to'
											accessibilityLabel='now-playing-tab-back-to'
											onTap={this.handleBackToTabTap}
											style={styles.expandedQueueTabButton}
										>
											<label style={backToLabelStyle} value={Strings.backTo()} />
										</view>
										<view
											accessibilityId='now-playing-tab-up-next'
											accessibilityLabel='now-playing-tab-up-next'
											onTap={this.handleUpNextTabTap}
											style={styles.expandedQueueTabButton}
										>
											<label style={upNextLabelStyle} value={Strings.upNext()} />
										</view>
										<view style={styles.queueTabsEdge} />
									</layout>
								</layout>
							</layout>
							<layout accessibilityLabel='now-playing-queue-list' style={styles.expandedQueueList}>
								{/* Strip holds both pages side-by-side; sliding it reveals one at a time */}
								<layout ref={this.queueSlideRef} style={styles.queueListStrip}>
									<view
										accessibilityId='now-playing-queue-page-back-to'
										accessibilityLabel='now-playing-queue-page-back-to'
										onLayout={this.handleQueuePageLayout}
										style={styles.queueListPage}
									>
										<TrackList
											animationsEnabled={this.viewModel.animationsEnabled}
											dragScroller={this.dragAutoScroller}
											noRowBackground
											onTrackLongPress={this.handleTrackLongPress}
											onTrackReorder={canEditQueue ? this.handleQueueTrackReorder : undefined}
											onTrackSwipeRemove={
												canEditQueue ? this.handleQueueTrackSwipeRemove : undefined
											}
											onTrackTap={this.handleTrackTap}
											palette={palette}
											rowIdentityPrefix='back-to-'
											showDragHandles
											tapPulseColor={accentColor}
											tracks={backToEntries}
										/>
									</view>
									<view
										accessibilityId='now-playing-queue-page-up-next'
										accessibilityLabel='now-playing-queue-page-up-next'
										style={styles.queueListPage}
									>
										<TrackList
											animationsEnabled={this.viewModel.animationsEnabled}
											dragScroller={this.dragAutoScroller}
											noRowBackground
											onTrackLongPress={this.handleTrackLongPress}
											onTrackReorder={canEditQueue ? this.handleQueueTrackReorder : undefined}
											onTrackSwipeRemove={
												canEditQueue ? this.handleQueueTrackSwipeRemove : undefined
											}
											onTrackTap={this.handleTrackTap}
											palette={palette}
											rowIdentityPrefix='up-next-'
											showDragHandles
											tapPulseColor={accentColor}
											tracks={upNextEntries}
										/>
									</view>
								</layout>
							</layout>
						</scroll>
					</view>
				</view>
			</view>
		</view>;

		// re-establish the imperatively-set progress width/labels after each render; the
		// cached styles omit width, so this isn't clobbered by re-renders
		this.updateProgressRefs();
	}
}

function formatDuration(seconds: number): string {
	const m = Math.floor(seconds / 60);
	const s = Math.floor(seconds % 60);
	return `${m}:${String(s).padStart(2, '0')}`;
}

function getLoopModeIcon(mode: LoopMode) {
	switch (mode) {
		case LoopModes.track:
			return res.looptrack;
		default:
			return res.loop;
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

function createCompactProgressFillStyle(accentColor: string): Style<View> {
	// width is intentionally omitted: set via ref in updateProgressRefs() so re-render
	// Style applications don't override more recent setAttribute calls
	return new Style<View>({
		backgroundColor: accentColor,
		borderRadius: theme.radius.default,
		bottom: 0,
		left: 0,
		opacity: 0.68,
		position: 'absolute',
		right: 'auto',
		top: 0,
	});
}

function getOverlayTintStyle(
	surfaceColor: string,
	opacity: number,
	borderRadius: number = theme.radius.default,
): Style<View> {
	return new Style<View>({
		backgroundColor: withAlpha(surfaceColor, opacity),
		borderRadius,
		bottom: 0,
		left: 0,
		position: 'absolute',
		right: 0,
		top: 0,
	});
}

function getQueueTabLabelStyle(color: string, isActive: boolean): Style<Label> {
	return new Style<Label>({
		...theme.text.sub,
		color,
		opacity: isActive ? 1 : 0.4,
		textAlign: 'center',
	});
}

function getPaletteStyles(onSurfaceColor: string, mutedOnSurfaceColor: string): PaletteStyles {
	return {
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
}

function getTopInsetBarStyle(surfaceColor: string): Style<View> {
	return new Style<View>({
		backgroundColor: surfaceColor,
		flexShrink: 0,
		height: theme.padding.deviceInset,
		width: '100%',
	});
}

const styles = {
	artwork: new Style<ImageView>({
		borderRadius: theme.radius.default,
		flexShrink: 0,
		height: 80,
		marginRight: 14,
		width: 80,
	}),
	compactBar: new Style<View>({
		alignItems: 'center',
		borderRadius: theme.radius.default,
		bottom: theme.footerHeight * 1.2,
		boxShadow: theme.shadow.floating,
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
		borderRadius: theme.radius.default,
		bottom: 0,
		left: 0,
		position: 'absolute',
		right: 0,
		top: 0,
	}),
	compactProgressContainer: new Style<View>({
		borderRadius: theme.radius.default,
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
		marginBottom: theme.footerHeight - 40,
		marginTop: 'auto',
		paddingTop: 8,
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
		marginBottom: 20,
		marginTop: 20,
		width: '100%',
	}),
	expandedFirstPage: new Style<Layout>({
		minHeight: '100%',
		width: '100%',
	}),
	expandedFormatCenter: new Style<View>({
		alignItems: 'center',
		left: 0,
		position: 'absolute',
		right: 0,
		top: -3,
	}),
	expandedInfoSection: new Style<Layout>({
		alignItems: 'center',
		flexGrow: 1,
		justifyContent: 'center',
		paddingLeft: 24,
		paddingRight: 24,
		paddingTop: 12,
		width: '100%',
	}),
	expandedInner: new Style<ScrollView>({
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
		justifyContent: 'center',
		paddingBottom: 15,
		paddingTop: 15,
	}),
	expandedQueueTabsRow: new Style<Layout>({
		flexDirection: 'row' as const,
		padding: 10,
		width: '100%',
	}),
	expandedScrollArtwork: new Style<ImageView>({
		aspectRatio: 1,
		opacity: 0,
		width: '100%',
	}),
	expandedScrollArtworkVisible: new Style<ImageView>({
		aspectRatio: 1,
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
		height: 75,
		justifyContent: 'flex-end',
		marginBottom: 10,
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
		borderRadius: theme.radius.default,
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
	queueListPage: new Style<View>({
		width: '50%',
	}),
	queueListStrip: new Style<Layout>({
		flexDirection: 'row',
		width: '200%',
	}),
	queueTabsEdge: new Style<View>({
		alignItems: 'center',
		justifyContent: 'center',
		width: 44,
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
	transitionArtwork: new Style<ImageView>({
		aspectRatio: 1,
		left: 12,
		position: 'absolute',
		top: 10,
		width: 65,
		zIndex: 40,
	}),
};
