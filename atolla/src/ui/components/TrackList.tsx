import res from 'atolla/res';
import { AnimationCurve } from 'valdi_core/src/AnimationOptions';
import { Component } from 'valdi_core/src/Component';
import { Device } from 'valdi_core/src/Device';
import { ElementRef } from 'valdi_core/src/ElementRef';
import { setTimeoutInterruptible } from 'valdi_core/src/SetTimeout';
import { Style } from 'valdi_core/src/Style';
import type { DragEvent, TouchEvent } from 'valdi_tsx/src/GestureEvents';
import type { ImageView, Label, Layout, View } from 'valdi_tsx/src/NativeTemplateElements';
import type { Track } from '../../models/Track';
import Strings from '../../Strings';
import type { Palette } from '../../services/color/types';
import type { ImageCache } from '../../services/ImageCache';
import { theme, withAlpha } from '../../theme';
import { hapticFeedback } from '../haptics';
import { CachedImage } from './CachedImage';
import { TouchEventState } from './TouchEventState';
import {
	edgeScrollDelta,
	neighbourShifts,
	type RowSlot,
	resolveReorderTarget,
	snapDisplacement,
} from './trackReorder';

/**
 * Lets the scroll owner expose just enough of its `<scroll>` for the list to
 * auto-scroll while a row is dragged to a viewport edge, without TrackList
 * needing to know about scroll plumbing.
 */
export interface DragAutoScroller {
	/** Scroll by `delta` points (clamped to content bounds); returns the delta actually applied. */
	scrollBy(delta: number): number;
	/** Enable/disable the user's scroll pan, so a row drag can't fight it. */
	setScrollEnabled(enabled: boolean): void;
	/** Screen-space vertical bounds of the scrollable viewport, if measured. */
	viewport(): { bottom: number; top: number } | undefined;
}

export interface TrackListEntry {
	artworkSource?: string | null;
	id: string;
	leadingLabel?: string | null;
	meta: string;
	title: string;
	track?: Track;
}

export interface TrackListViewModel {
	animationsEnabled?: boolean;
	dragScroller?: DragAutoScroller;
	/**
	 * Arm reordering with a long-press on the handle and track movement via onTouch,
	 * instead of an onDrag on the row. Defaults to platform: required on iOS, where the
	 * ancestor scroll's pan otherwise races (and cancels) the row's drag recogniser.
	 */
	holdToReorder?: boolean;
	imageCache?: ImageCache;
	noRowBackground?: boolean;
	onTrackLongPress?: (track: Track) => void;
	onTrackReorder?: (fromEntryIndex: number, toEntryIndex: number) => void;
	onTrackSwipeRemove?: (trackId: string, entryIndex: number) => void;
	onTrackTap?: (trackId: string) => void;
	palette?: Palette;
	rowIdentityPrefix?: string;
	showDragHandles?: boolean;
	tapPulseColor?: string;
	tracks: Array<TrackListEntry>;
}

interface TrackListColors {
	meta: string;
	rowBackground: string;
	tileBackground: string;
	title: string;
}

interface TrackListResolvedStyles {
	artworkTileStyle: Style<View>;
	emptyStateStyle: Style<Label>;
	leadingLabelTextStyle: Style<Label>;
	metaStyle: Style<Label>;
	rowStyle: Style<View>;
	titleStyle: Style<Label>;
}

const defaultColors: TrackListColors = {
	meta: theme.text.sub.color,
	rowBackground: theme.colors.bg,
	tileBackground: theme.colors.bgDeep,
	title: theme.text.main.color,
};

const MAX_SWIPE_DISTANCE = 88;
const REMOVE_SWIPE_DISTANCE = 64;
const REMOVE_SWIPE_VELOCITY = 700;
// Fallback slot height, used only when live row geometry is unavailable (before the
// first layout pass or in unit tests). Real drags measure each row's frame instead.
const ROW_SLOT_HEIGHT = 72;
const AUTO_SCROLL_EDGE = 72;
const AUTO_SCROLL_STEP = 14;
const AUTO_SCROLL_INTERVAL = 16;
// The ancestor scroll delays delivering touches to its content on iOS, so the
// recogniser's timer starts late; with the delay the effective hold is ~250ms,
// matching the platform-standard lift. At the 0.25s default the long press fired
// only after the finger had started moving, and failed its movement tolerance.
const HANDLE_LONG_PRESS_SECONDS = 0.1;

export class TrackList extends Component<TrackListViewModel> {
	private draggingRowIdentities = new Set<string>();
	private pulseOverlayStyle = buildPulseOverlayStyle(undefined);
	private dragHandleRefByIdentity = new Map<string, ElementRef>();
	private handleBeingPressedIdentity: string | null = null;
	private neighborBounceTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
	private tapPulseTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
	private neighborOffsetByIdentity = new Map<string, number>();
	private rowIdentitiesByIndex: Array<string> = [];
	private longPressTimeout: ReturnType<typeof setTimeout> | null = null;
	private removeAnimationTimeout: ReturnType<typeof setTimeout> | null = null;
	private pulseOverlayRefByIdentity = new Map<string, ElementRef>();
	private removeActionRefByIdentity = new Map<string, ElementRef>();
	private suppressNextTap = false;
	private rowOffsetByIdentity = new Map<string, number>();
	private rowRefByIdentity = new Map<string, ElementRef>();
	private swipeContainerRefByIdentity = new Map<string, ElementRef>();
	private rowTapHandlerByIdentity = new Map<string, () => void>();
	private dragSlots: Array<RowSlot> = [];
	private dragFromIndex = -1;
	private dragRowIdentity: string | null = null;
	private dragScrollAccum = 0;
	private armedDragOriginY = 0;
	private lastDragEvent: DragEvent | null = null;
	private autoScrollTimeout: ReturnType<typeof setTimeout> | null = null;

	private get holdToReorder(): boolean {
		return this.viewModel.holdToReorder ?? Device.isIOS();
	}

	private canStartHorizontalSwipe = (event: DragEvent): boolean => {
		return this.draggingRowIdentities.size === 0 && Math.abs(event.deltaX) > Math.abs(event.deltaY);
	};

	private getRowTapHandler = (rowIdentity: string, trackId: string): (() => void) => {
		const existing = this.rowTapHandlerByIdentity.get(rowIdentity);
		if (existing) {
			return existing;
		}

		const handler = (): void => {
			if (this.suppressNextTap) {
				this.suppressNextTap = false;
				return;
			}
			this.performSelectionHaptic();
			this.triggerTapPulse(rowIdentity);
			this.viewModel.onTrackTap?.(trackId);
		};

		this.rowTapHandlerByIdentity.set(rowIdentity, handler);
		return handler;
	};

	onDestroy(): void {
		this.stopAutoScroll();
		this.resetDragState();
		if (this.longPressTimeout) {
			clearTimeout(this.longPressTimeout);
			this.longPressTimeout = null;
		}
		if (this.removeAnimationTimeout) {
			clearTimeout(this.removeAnimationTimeout);
			this.removeAnimationTimeout = null;
		}
		for (const timeout of this.neighborBounceTimeouts.values()) clearTimeout(timeout);
		this.neighborBounceTimeouts.clear();
		for (const timeout of this.tapPulseTimeouts.values()) clearTimeout(timeout);
		this.tapPulseTimeouts.clear();
		this.neighborOffsetByIdentity.clear();
		this.dragHandleRefByIdentity.clear();
		this.pulseOverlayRefByIdentity.clear();
		this.removeActionRefByIdentity.clear();
		this.rowOffsetByIdentity.clear();
		this.rowRefByIdentity.clear();
		this.swipeContainerRefByIdentity.clear();
		this.rowTapHandlerByIdentity.clear();
		this.rowIdentitiesByIndex.length = 0;
	}

	onViewModelUpdate(prevViewModel: TrackListViewModel): void {
		if (
			!prevViewModel ||
			this.viewModel.tapPulseColor !== prevViewModel.tapPulseColor ||
			this.viewModel.palette !== prevViewModel.palette
		) {
			this.pulseOverlayStyle = buildPulseOverlayStyle(this.viewModel.tapPulseColor);
		}

		if (!prevViewModel || prevViewModel.tracks.length <= this.viewModel.tracks.length) return;

		const prevTracks = prevViewModel.tracks;
		const nextTracks = this.viewModel.tracks;

		let removedIndex = prevTracks.length - 1;
		for (let i = 0; i < nextTracks.length; i++) {
			if (prevTracks[i].id !== nextTracks[i].id) {
				removedIndex = i;
				break;
			}
		}

		if (removedIndex >= nextTracks.length) return;

		const shiftedIdentities = nextTracks
			.slice(removedIndex)
			.map((entry, i) => `${entry.id}-${removedIndex + i}`);

		if (this.removeAnimationTimeout) clearTimeout(this.removeAnimationTimeout);
		this.removeAnimationTimeout = setTimeoutInterruptible(() => {
			this.removeAnimationTimeout = null;
			if (this.isDestroyed()) return;
			for (const identity of shiftedIdentities) {
				const containerRef = this.swipeContainerRefByIdentity.get(identity);
				if (!containerRef) continue;
				containerRef.setAttribute('top', ROW_SLOT_HEIGHT);
				containerRef.setAttribute('bottom', -ROW_SLOT_HEIGHT);
			}

			const overshoot = -ROW_SLOT_HEIGHT * 0.08;
			this.animate(
				{ beginFromCurrentState: true, curve: AnimationCurve.EaseOut, duration: 0.16 },
				() => {
					for (const identity of shiftedIdentities) {
						this.setRowVerticalOffset(identity, overshoot);
					}
				},
			);

			this.removeAnimationTimeout = setTimeoutInterruptible(() => {
				this.removeAnimationTimeout = null;
				if (this.isDestroyed()) return;
				this.animate(
					{ beginFromCurrentState: true, curve: AnimationCurve.EaseOut, duration: 0.1 },
					() => {
						for (const identity of shiftedIdentities) {
							this.setRowVerticalOffset(identity, 0);
						}
					},
				);
			}, 160);
		}, 0);
	}

	onRender() {
		// After every re-render with no active drag, wipe all stale vertical offsets so
		// rows can never visually overlap regardless of how we arrived here.
		if (this.draggingRowIdentities.size === 0) {
			for (const timeout of this.neighborBounceTimeouts.values()) clearTimeout(timeout);
			this.neighborBounceTimeouts.clear();
			this.neighborOffsetByIdentity.clear();
			const prefix = this.viewModel.rowIdentityPrefix ?? '';
			for (let i = 0; i < this.viewModel.tracks.length; i++) {
				const ref = this.swipeContainerRefByIdentity.get(
					`${prefix}${this.viewModel.tracks[i].id}-${i}`,
				);
				if (ref) {
					ref.setAttribute('top', 0);
					ref.setAttribute('bottom', 0);
				}
			}
		}

		const colors = resolveColors(this.viewModel.palette, this.viewModel.noRowBackground);
		const dragHighlightColor = withAlpha(
			this.viewModel.palette?.accent.hex ?? theme.colors.active,
			0.28,
		);
		const resolvedStyles = getResolvedTrackListStyles(colors);

		if (this.viewModel.tracks.length === 0) {
			<label
				key='track-list-empty'
				style={resolvedStyles.emptyStateStyle}
				value={Strings.nothingElseLinedUp()}
			/>;
			return;
		}

		<layout style={styles.list}>
			{this.viewModel.tracks.map((entry: TrackListEntry, index: number) => {
				const rowIdentity = `${this.viewModel.rowIdentityPrefix ?? ''}${entry.id}-${index}`;
				this.rowIdentitiesByIndex[index] = rowIdentity;
				const canSwipe = Boolean(this.viewModel.onTrackSwipeRemove);
				const canReorder = Boolean(this.viewModel.onTrackReorder);
				// On iOS the row's drag recogniser races the ancestor scroll's pan (which
				// force-cancels descendant gestures once it wins), so reordering is armed by
				// a long-press on the handle instead and movement is read from onTouch.
				const dragToReorder = canReorder && !this.holdToReorder;

				return (
					<view
						accessibilityId={`track-row-drag-${rowIdentity}`}
						accessibilityLabel={`track-row-drag-${rowIdentity}`}
						key={rowIdentity}
						onDrag={
							dragToReorder
								? ((entryIndex, identity, rowBg, activeDragColor) => (event) => {
										this.handleHandleDrag(event, entryIndex, identity, rowBg, activeDragColor);
									})(index, rowIdentity, colors.rowBackground, dragHighlightColor)
								: undefined
						}
						onDragDisabled={!dragToReorder}
						onDragPredicate={
							dragToReorder
								? (
										(identity) => (event) =>
											((this.handleBeingPressedIdentity === identity &&
												this.draggingRowIdentities.size === 0) ||
												this.draggingRowIdentities.has(identity)) &&
											Math.abs(event.deltaY) > Math.abs(event.deltaX)
									)(rowIdentity)
								: undefined
						}
						ref={this.getSwipeContainerRef(rowIdentity)}
						style={styles.swipeContainer}
					>
						{canSwipe && this.viewModel.showDragHandles ? (
							<view
								accessibilityId={`track-row-remove-action-${rowIdentity}`}
								accessibilityLabel={`track-row-remove-action-${rowIdentity}`}
								ref={this.getRemoveActionRef(rowIdentity)}
								style={styles.swipeRemoveActionContainer}
							>
								<image
									accessibilityId={`track-row-remove-icon-${rowIdentity}`}
									accessibilityLabel={`track-row-remove-icon-${rowIdentity}`}
									src={res.trash}
									style={styles.swipeRemoveActionIcon}
									tint={theme.colors.destructive}
								/>
							</view>
						) : null}
						<view
							accessibilityId={`track-row-${rowIdentity}`}
							accessibilityLabel={`track-row-${rowIdentity}`}
							ref={this.getRowRef(rowIdentity)}
							style={resolvedStyles.rowStyle}
						>
							<view ref={this.getPulseOverlayRef(rowIdentity)} style={this.pulseOverlayStyle} />
							<layout style={styles.rowInteractiveLayout}>
								<view
									accessibilityId={`track-row-swipe-region-${rowIdentity}`}
									accessibilityLabel={`track-row-swipe-region-${rowIdentity}`}
									onDrag={
										canSwipe
											? ((trackId, entryIndex, identity) => (event) => {
													this.handleRowDrag(event, trackId, entryIndex, identity);
												})(entry.id, index, rowIdentity)
											: undefined
									}
									onDragDisabled={!canSwipe}
									onDragPredicate={this.canStartHorizontalSwipe}
									onTap={this.getRowTapHandler(rowIdentity, entry.id)}
									onTouch={
										entry.track && this.viewModel.onTrackLongPress
											? ((track) => (event) => {
													this.handleTrackTouch(event as DragEvent, track);
												})(entry.track)
											: undefined
									}
									style={styles.swipeGestureRegion}
								>
									<layout style={styles.rowContent}>
										{entry.artworkSource ? (
											<view style={resolvedStyles.artworkTileStyle}>
												<CachedImage
													category='album_art_thumb'
													objectFit='cover'
													style={styles.artwork}
													url={entry.artworkSource}
												/>
											</view>
										) : entry.leadingLabel ? (
											<view style={styles.leadingLabelTile}>
												<label
													style={resolvedStyles.leadingLabelTextStyle}
													value={entry.leadingLabel}
												/>
											</view>
										) : null}

										<layout style={styles.textBlock}>
											<label
												accessibilityId={`track-title-${rowIdentity}`}
												accessibilityLabel={`track-title-${rowIdentity}`}
												numberOfLines={2}
												style={resolvedStyles.titleStyle}
												textOverflow='ellipsis'
												value={entry.title}
											/>
											<label
												numberOfLines={1}
												style={resolvedStyles.metaStyle}
												textOverflow='ellipsis'
												value={entry.meta}
											/>
										</layout>
									</layout>
								</view>

								{this.viewModel.showDragHandles ? (
									<view
										accessibilityId={`track-row-edit-handle-${rowIdentity}`}
										accessibilityLabel={`track-row-edit-handle-${rowIdentity}`}
										longPressDuration={HANDLE_LONG_PRESS_SECONDS}
										onLongPress={
											canReorder && this.holdToReorder
												? (
														(entryIndex, identity, rowBg, activeDragColor) =>
														(event: TouchEvent) => {
															this.armReorder(event, entryIndex, identity, rowBg, activeDragColor);
														}
													)(index, rowIdentity, colors.rowBackground, dragHighlightColor)
												: undefined
										}
										onLongPressDisabled={!(canReorder && this.holdToReorder)}
										onTap={
											entry.track && this.viewModel.onTrackLongPress
												? ((track) => () => {
														if (this.suppressNextTap) {
															this.suppressNextTap = false;
															return;
														}
														this.performSelectionHaptic();
														this.viewModel.onTrackLongPress?.(track);
													})(entry.track)
												: undefined
										}
										onTouch={
											canReorder
												? (
														(entryIndex, identity, rowBg, activeDragColor) =>
														(event: TouchEvent) => {
															this.handleReorderHandleTouch(
																event,
																entryIndex,
																identity,
																rowBg,
																activeDragColor,
															);
														}
													)(index, rowIdentity, colors.rowBackground, dragHighlightColor)
												: undefined
										}
										ref={this.getDragHandleRef(rowIdentity)}
										style={styles.editHandleContainer}
									>
										<image
											src={res.draghandle}
											style={styles.editHandleIcon}
											tint={withAlpha(theme.colors.white, 0.58)}
										/>
									</view>
								) : null}
							</layout>
						</view>
					</view>
				);
			})}
		</layout>;
	}

	private getPulseOverlayRef(identity: string): ElementRef {
		const existing = this.pulseOverlayRefByIdentity.get(identity);
		if (existing) {
			return existing;
		}
		const created = new ElementRef();
		this.pulseOverlayRefByIdentity.set(identity, created);
		return created;
	}

	private triggerTapPulse(identity: string): void {
		const ref = this.pulseOverlayRefByIdentity.get(identity);
		if (!ref) {
			return;
		}
		ref.setAttribute('opacity', 0.28);
		if (this.viewModel.animationsEnabled) {
			this.animate({ curve: AnimationCurve.EaseOut, duration: 0.15 }, () => {
				ref.setAttribute('opacity', 0);
			});
		} else {
			const prev = this.tapPulseTimeouts.get(identity);
			if (prev) clearTimeout(prev);
			this.tapPulseTimeouts.set(
				identity,
				setTimeout(() => {
					this.tapPulseTimeouts.delete(identity);
					ref.setAttribute('opacity', 0);
				}, 180),
			);
		}
	}

	private getRowRef(identity: string): ElementRef {
		const existing = this.rowRefByIdentity.get(identity);
		if (existing) {
			return existing;
		}
		const created = new ElementRef();
		this.rowRefByIdentity.set(identity, created);
		return created;
	}

	private getSwipeContainerRef(identity: string): ElementRef {
		const existing = this.swipeContainerRefByIdentity.get(identity);
		if (existing) {
			return existing;
		}
		const created = new ElementRef();
		this.swipeContainerRefByIdentity.set(identity, created);
		return created;
	}

	private getDragHandleRef(identity: string): ElementRef {
		const existing = this.dragHandleRefByIdentity.get(identity);
		if (existing) {
			return existing;
		}
		const created = new ElementRef();
		this.dragHandleRefByIdentity.set(identity, created);
		return created;
	}

	private setRowOffset(identity: string, offset: number): void {
		const rowRef = this.rowRefByIdentity.get(identity);
		if (!rowRef) {
			return;
		}
		this.rowOffsetByIdentity.set(identity, offset);
		rowRef.setAttribute('left', offset);
		rowRef.setAttribute('right', -offset);
		this.setRemoveActionProgress(identity, offset);
	}

	private setRowVerticalOffset(identity: string, offset: number): void {
		const containerRef = this.swipeContainerRefByIdentity.get(identity);
		if (!containerRef) {
			return;
		}

		containerRef.setAttribute('top', offset);
		containerRef.setAttribute('bottom', -offset);
	}

	private setRowDraggingAppearance(
		identity: string,
		isDragging: boolean,
		defaultBackgroundColor: string,
		dragBackgroundColor: string,
	): void {
		const containerRef = this.swipeContainerRefByIdentity.get(identity);
		const rowRef = this.rowRefByIdentity.get(identity);
		if (!rowRef) {
			return;
		}

		// Valdi applies zIndex by removing and re-inserting the native view
		// (ViewNode::setZIndex → removeViewFromParent). On iOS that cancels every
		// in-flight touch in the subtree — including the very gesture driving the
		// drag — so the hold-to-reorder path must not touch z-order mid-gesture.
		const canRestack = !this.holdToReorder;

		if (isDragging) {
			this.draggingRowIdentities.add(identity);
			if (canRestack) {
				rowRef.setAttribute('zIndex', 20);
				rowRef.setAttribute('elevation', 12);
				containerRef?.setAttribute('zIndex', 100);
			}
			rowRef.setAttribute('backgroundColor', dragBackgroundColor);
			return;
		}

		this.draggingRowIdentities.delete(identity);
		this.handleBeingPressedIdentity = null;
		if (canRestack) {
			rowRef.setAttribute('zIndex', 0);
			rowRef.setAttribute('elevation', 0);
			containerRef?.setAttribute('zIndex', 0);
		}
		rowRef.setAttribute('backgroundColor', defaultBackgroundColor);
	}

	private getRemoveActionRef(identity: string): ElementRef {
		const existing = this.removeActionRefByIdentity.get(identity);
		if (existing) {
			return existing;
		}
		const created = new ElementRef();
		this.removeActionRefByIdentity.set(identity, created);
		return created;
	}

	private setRemoveActionProgress(identity: string, offset: number): void {
		const removeActionRef = this.removeActionRefByIdentity.get(identity);
		if (!removeActionRef) {
			return;
		}

		const clampedOffset = Math.max(-MAX_SWIPE_DISTANCE, Math.min(0, offset));
		const progress = Math.min(1, Math.abs(clampedOffset) / MAX_SWIPE_DISTANCE);
		const hiddenRight = -10;
		const visibleRight = 12;
		const animatedRight = hiddenRight + (visibleRight - hiddenRight) * progress;

		removeActionRef.setAttribute('opacity', progress);
		removeActionRef.setAttribute('right', animatedRight);
	}

	private resetRowOffset(identity: string): void {
		this.setRowOffset(identity, 0);
	}

	private updateNeighbourOffsets(targetIndex: number): void {
		const shifts = new Map<number, number>();
		for (const shift of neighbourShifts(this.dragSlots, this.dragFromIndex, targetIndex)) {
			shifts.set(shift.index, shift.offset);
		}

		for (let i = 0; i < this.rowIdentitiesByIndex.length; i++) {
			if (i === this.dragFromIndex) continue;
			const identity = this.rowIdentitiesByIndex[i];
			if (!identity) continue;

			const offset = shifts.get(i) ?? 0;
			const current = this.neighborOffsetByIdentity.get(identity) ?? 0;
			if (offset === current) continue;

			this.neighborOffsetByIdentity.set(identity, offset);
			this.animateNeighborToOffset(identity, offset);
		}
	}

	private animateNeighborToOffset(identity: string, targetOffset: number): void {
		const pending = this.neighborBounceTimeouts.get(identity);
		if (pending) {
			clearTimeout(pending);
			this.neighborBounceTimeouts.delete(identity);
		}

		if (targetOffset === 0) {
			this.animate(
				{ beginFromCurrentState: true, curve: AnimationCurve.EaseOut, duration: 0.18 },
				() => {
					this.setRowVerticalOffset(identity, 0);
				},
			);
			return;
		}

		// Phase 1: overshoot 15% past the target
		this.animate(
			{ beginFromCurrentState: true, curve: AnimationCurve.EaseOut, duration: 0.12 },
			() => {
				this.setRowVerticalOffset(identity, targetOffset * 1.15);
			},
		);

		// Phase 2: settle back to exact target
		const timeout = setTimeout(() => {
			this.neighborBounceTimeouts.delete(identity);
			if ((this.neighborOffsetByIdentity.get(identity) ?? 0) !== targetOffset) return;
			this.animate(
				{ beginFromCurrentState: true, curve: AnimationCurve.EaseOut, duration: 0.09 },
				() => {
					this.setRowVerticalOffset(identity, targetOffset);
				},
			);
		}, 120);
		this.neighborBounceTimeouts.set(identity, timeout);
	}

	private resetNeighborOffsets(draggingIdentity: string): void {
		for (const identity of this.rowIdentitiesByIndex) {
			if (identity === draggingIdentity) continue;
			const pending = this.neighborBounceTimeouts.get(identity);
			if (pending) {
				clearTimeout(pending);
				this.neighborBounceTimeouts.delete(identity);
			}
			const current = this.neighborOffsetByIdentity.get(identity) ?? 0;
			if (current === 0) continue;
			this.neighborOffsetByIdentity.set(identity, 0);
			this.animate(
				{ beginFromCurrentState: true, curve: AnimationCurve.EaseOut, duration: 0.18 },
				() => {
					this.setRowVerticalOffset(identity, 0);
				},
			);
		}
	}

	private handleRowDrag(
		event: DragEvent,
		trackId: string,
		entryIndex: number,
		rowIdentity: string,
	): void {
		if (event.state === TouchEventState.Changed) {
			const offset = Math.max(-MAX_SWIPE_DISTANCE, Math.min(0, event.deltaX));
			this.setRowOffset(rowIdentity, offset);
			this.cancelLongPress();
			return;
		}

		if (event.state !== TouchEventState.Ended) {
			return;
		}

		const currentOffset = this.rowOffsetByIdentity.get(rowIdentity) ?? 0;
		const hasDistance = currentOffset <= -REMOVE_SWIPE_DISTANCE;
		const hasVelocity = event.velocityX <= -REMOVE_SWIPE_VELOCITY;

		if (!hasDistance && !hasVelocity) {
			this.resetRowOffset(rowIdentity);
			return;
		}

		this.setRowOffset(rowIdentity, -MAX_SWIPE_DISTANCE);
		this.suppressNextTap = true;
		this.performSelectionHaptic();
		this.viewModel.onTrackSwipeRemove?.(trackId, entryIndex);
	}

	private handleHandleDrag(
		event: DragEvent,
		entryIndex: number,
		rowIdentity: string,
		defaultBackgroundColor: string,
		dragBackgroundColor: string,
	): void {
		if (!this.viewModel.onTrackReorder) {
			return;
		}

		if (event.state === TouchEventState.Started) {
			this.beginHandleDrag(entryIndex, rowIdentity, defaultBackgroundColor, dragBackgroundColor);
			return;
		}

		if (event.state === TouchEventState.Changed) {
			if (this.dragFromIndex !== entryIndex) {
				this.beginHandleDrag(entryIndex, rowIdentity, defaultBackgroundColor, dragBackgroundColor);
			}
			this.lastDragEvent = event;
			this.updateAutoScroll(event);
			this.applyDragPosition(event.deltaY);
			return;
		}

		this.stopAutoScroll();

		if (event.state !== TouchEventState.Ended) {
			this.cancelDrag(rowIdentity, defaultBackgroundColor, dragBackgroundColor);
			return;
		}

		const slots = this.slotsFor(entryIndex);
		const scrollAccum = this.dragFromIndex === entryIndex ? this.dragScrollAccum : 0;
		const slot = slots[entryIndex];
		const targetIndex = slot
			? resolveReorderTarget(
					slots,
					entryIndex,
					slot.top + slot.height / 2 + event.deltaY + scrollAccum,
				)
			: entryIndex;

		if (!slot || targetIndex === entryIndex) {
			this.cancelDrag(rowIdentity, defaultBackgroundColor, dragBackgroundColor);
			return;
		}

		// Snap dragged row to its final slot; leave neighbours shifted — the re-render
		// from onTrackReorder will replace this state seamlessly without a flash.
		this.setRowVerticalOffset(rowIdentity, snapDisplacement(slots, entryIndex, targetIndex));
		this.setRowDraggingAppearance(rowIdentity, false, defaultBackgroundColor, dragBackgroundColor);
		this.resetRowOffset(rowIdentity);
		this.suppressNextTap = true;
		// Clear stale offset tracking so future drags don't skip animations for
		// elements that happen to share an identity with a previous neighbour.
		this.clearNeighbourTracking();
		this.resetDragState();
		this.viewModel.onTrackReorder(entryIndex, targetIndex);
	}

	private beginHandleDrag(
		entryIndex: number,
		rowIdentity: string,
		defaultBackgroundColor: string,
		dragBackgroundColor: string,
	): void {
		this.setRowDraggingAppearance(rowIdentity, true, defaultBackgroundColor, dragBackgroundColor);
		this.dragSlots = this.buildDragSlots();
		this.dragFromIndex = entryIndex;
		this.dragRowIdentity = rowIdentity;
		this.dragScrollAccum = 0;
	}

	// Hold-to-reorder arm: the native long-press recogniser staying active is what
	// stops the ancestor scroll's pan from starting for the rest of this touch;
	// disabling the scroll is belt-and-braces on top of that.
	private armReorder(
		event: TouchEvent,
		entryIndex: number,
		rowIdentity: string,
		defaultBackgroundColor: string,
		dragBackgroundColor: string,
	): void {
		if (!this.viewModel.onTrackReorder || this.draggingRowIdentities.size > 0) {
			return;
		}
		this.cancelLongPress();
		this.beginHandleDrag(entryIndex, rowIdentity, defaultBackgroundColor, dragBackgroundColor);
		this.armedDragOriginY = event.absoluteY;
		this.performSelectionHaptic();
		this.viewModel.dragScroller?.setScrollEnabled(false);
	}

	private handleReorderHandleTouch(
		event: TouchEvent,
		entryIndex: number,
		rowIdentity: string,
		defaultBackgroundColor: string,
		dragBackgroundColor: string,
	): void {
		if (event.state === TouchEventState.Started) {
			this.handleBeingPressedIdentity = rowIdentity;
		} else if (event.state !== TouchEventState.Changed) {
			if (this.handleBeingPressedIdentity === rowIdentity) {
				this.handleBeingPressedIdentity = null;
			}
		}

		// Once armed, the touch stream drives the drag (it keeps delivering even while
		// the long-press recogniser is active, unlike onDrag).
		if (!this.holdToReorder || this.dragRowIdentity !== rowIdentity) {
			return;
		}
		if (event.state === TouchEventState.Started) {
			return;
		}

		this.handleHandleDrag(
			{
				...event,
				deltaX: 0,
				deltaY: event.absoluteY - this.armedDragOriginY,
				velocityX: 0,
				velocityY: 0,
			},
			entryIndex,
			rowIdentity,
			defaultBackgroundColor,
			dragBackgroundColor,
		);
	}

	private applyDragPosition(deltaY: number): void {
		if (this.dragFromIndex < 0 || !this.dragRowIdentity) {
			return;
		}
		const slot = this.dragSlots[this.dragFromIndex];
		if (!slot) {
			return;
		}

		this.setRowVerticalOffset(this.dragRowIdentity, deltaY + this.dragScrollAccum);
		const centre = slot.top + slot.height / 2 + deltaY + this.dragScrollAccum;
		this.updateNeighbourOffsets(resolveReorderTarget(this.dragSlots, this.dragFromIndex, centre));
	}

	private cancelDrag(
		rowIdentity: string,
		defaultBackgroundColor: string,
		dragBackgroundColor: string,
	): void {
		this.setRowVerticalOffset(rowIdentity, 0);
		this.resetNeighborOffsets(rowIdentity);
		this.setRowDraggingAppearance(rowIdentity, false, defaultBackgroundColor, dragBackgroundColor);
		this.resetDragState();
	}

	private resetDragState(): void {
		this.stopAutoScroll();
		this.dragSlots = [];
		this.dragFromIndex = -1;
		this.dragRowIdentity = null;
		this.dragScrollAccum = 0;
		this.armedDragOriginY = 0;
		this.lastDragEvent = null;
		if (this.holdToReorder) {
			this.viewModel.dragScroller?.setScrollEnabled(true);
		}
	}

	private clearNeighbourTracking(): void {
		for (const timeout of this.neighborBounceTimeouts.values()) clearTimeout(timeout);
		this.neighborBounceTimeouts.clear();
		this.neighborOffsetByIdentity.clear();
	}

	// Live slots snapshotted at drag start; rebuilt fresh if this row isn't the
	// active drag (e.g. an isolated Ended event in a unit test).
	private slotsFor(entryIndex: number): Array<RowSlot> {
		if (
			this.dragFromIndex === entryIndex &&
			this.dragSlots.length === this.viewModel.tracks.length
		) {
			return this.dragSlots;
		}
		return this.buildDragSlots();
	}

	// Measure each row's natural top/height; fall back to a uniform slot height when
	// geometry is unavailable (before first layout, or in unit tests).
	private buildDragSlots(): Array<RowSlot> {
		const count = this.viewModel.tracks.length;
		const measured: Array<RowSlot> = [];
		for (let i = 0; i < count; i++) {
			const identity = this.rowIdentitiesByIndex[i];
			const frame = identity
				? this.swipeContainerRefByIdentity.get(identity)?.all()?.[0]?.frame
				: undefined;
			if (!frame?.height) break;
			measured.push({ height: frame.height, top: frame.y });
		}

		if (measured.length === count) {
			return measured;
		}

		const slots: Array<RowSlot> = [];
		for (let i = 0; i < count; i++) {
			slots.push({ height: ROW_SLOT_HEIGHT, top: i * ROW_SLOT_HEIGHT });
		}
		return slots;
	}

	private updateAutoScroll(event: DragEvent): void {
		const scroller = this.viewModel.dragScroller;
		if (!scroller) {
			return;
		}
		const viewport = scroller.viewport();
		const desired = viewport
			? edgeScrollDelta(event.absoluteY, viewport, AUTO_SCROLL_EDGE, AUTO_SCROLL_STEP)
			: 0;

		if (desired === 0) {
			this.stopAutoScroll();
			return;
		}

		// Scroll once immediately on reaching an edge for responsiveness, then keep
		// scrolling on a timer while the finger is held there.
		if (this.autoScrollTimeout === null) {
			this.performAutoScrollStep(event);
			this.autoScrollTimeout = setTimeoutInterruptible(this.autoScrollTick, AUTO_SCROLL_INTERVAL);
		}
	}

	private performAutoScrollStep(event: DragEvent): void {
		const scroller = this.viewModel.dragScroller;
		const viewport = scroller?.viewport();
		if (!scroller || !viewport) {
			return;
		}
		const desired = edgeScrollDelta(event.absoluteY, viewport, AUTO_SCROLL_EDGE, AUTO_SCROLL_STEP);
		if (desired === 0) {
			return;
		}
		const applied = scroller.scrollBy(desired);
		if (applied === 0) {
			return;
		}
		this.dragScrollAccum += applied;
		this.applyDragPosition(event.deltaY);
	}

	private autoScrollTick = (): void => {
		this.autoScrollTimeout = null;
		if (this.isDestroyed()) {
			return;
		}
		const event = this.lastDragEvent;
		if (!event) {
			return;
		}

		const before = this.dragScrollAccum;
		this.performAutoScrollStep(event);
		// Stop if the edge was left or a scroll bound was hit (no movement applied).
		if (this.dragScrollAccum === before) {
			return;
		}
		this.autoScrollTimeout = setTimeoutInterruptible(this.autoScrollTick, AUTO_SCROLL_INTERVAL);
	};

	private stopAutoScroll(): void {
		if (this.autoScrollTimeout) {
			clearTimeout(this.autoScrollTimeout);
			this.autoScrollTimeout = null;
		}
	}

	private scheduleLongPress(track?: Track): void {
		if (!track || !this.viewModel.onTrackLongPress) {
			return;
		}

		if (this.longPressTimeout) {
			clearTimeout(this.longPressTimeout);
		}

		this.longPressTimeout = setTimeout(() => {
			this.performSelectionHaptic();
			this.suppressNextTap = true;
			this.viewModel.onTrackLongPress?.(track);
			this.longPressTimeout = null;
		}, 500);
	}

	private performSelectionHaptic(): void {
		hapticFeedback();
	}

	private cancelLongPress(): void {
		if (!this.longPressTimeout) {
			return;
		}
		clearTimeout(this.longPressTimeout);
		this.longPressTimeout = null;
	}

	private handleTrackTouch(event: DragEvent, track?: Track): void {
		if (event.state === TouchEventState.Started) {
			this.scheduleLongPress(track);
			return;
		}

		if (event.state === TouchEventState.Changed) {
			return;
		}

		this.cancelLongPress();
	}
}

function getResolvedTrackListStyles(colors: TrackListColors): TrackListResolvedStyles {
	const created: TrackListResolvedStyles = {
		artworkTileStyle: new Style<View>({
			aspectRatio: 1,
			backgroundColor: colors.tileBackground,
			borderRadius: theme.radius.default / 2,
			slowClipping: true,
			width: 42,
		}),
		emptyStateStyle: new Style<Label>({
			...theme.text.sub,
			color: colors.meta,
			margin: 8,
			textAlign: 'center',
		}),
		leadingLabelTextStyle: new Style<Label>({
			...theme.text.main,
			color: colors.title,
			textAlign: 'center',
		}),
		metaStyle: new Style<Label>({
			...theme.text.sub,
			color: colors.meta,
			flexShrink: 1,
			marginTop: 3,
		}),
		rowStyle: new Style<View>({
			backgroundColor: colors.rowBackground,
			borderRadius: theme.radius.default,
			paddingBottom: 8,
			paddingLeft: 10,
			paddingRight: 10,
			paddingTop: 8,
		}),
		titleStyle: new Style<Label>({
			...theme.text.mainBold,
			color: colors.title,
			flexShrink: 1,
		}),
	};

	return created;
}

function resolveColors(palette?: Palette, noRowBackground?: boolean): TrackListColors {
	if (!palette) {
		return noRowBackground ? { ...defaultColors, rowBackground: 'transparent' } : defaultColors;
	}

	return {
		meta: palette.muted_on_surface.hex,
		rowBackground: noRowBackground ? 'transparent' : palette.surface.hex,
		tileBackground: palette.surface.hex,
		title: palette.on_surface.hex,
	};
}

function buildPulseOverlayStyle(tapPulseColor: string | undefined): Style<View> {
	return new Style<View>({
		backgroundColor: tapPulseColor ?? theme.colors.white,
		borderRadius: theme.radius.default,
		bottom: 0,
		left: 0,
		opacity: 0,
		position: 'absolute',
		right: 0,
		top: 0,
	});
}

const styles = {
	artwork: new Style<ImageView>({
		borderRadius: theme.radius.default / 2,
		height: '100%',
		width: '100%',
	}),
	editHandleContainer: new Style<View>({
		alignItems: 'center',
		justifyContent: 'center',
		paddingLeft: 8,
		paddingRight: 2,
	}),
	editHandleIcon: new Style<ImageView>({
		height: 24,
		width: 24,
	}),
	leadingLabelTile: new Style<View>({
		alignItems: 'center',
		alignSelf: 'flex-start',
		aspectRatio: 1,
		justifyContent: 'flex-start',
		paddingTop: 5,
		width: 38,
	}),
	list: new Style<Layout>({
		width: '100%',
	}),
	rowContent: new Style<Layout>({
		alignItems: 'center',
		flexDirection: 'row',
		flexGrow: 1,
	}),
	rowInteractiveLayout: new Style<Layout>({
		alignItems: 'center',
		flexDirection: 'row',
		width: '100%',
	}),
	swipeContainer: new Style<View>({
		overflow: 'visible',
		position: 'relative',
		width: '100%',
	}),
	swipeGestureRegion: new Style<Layout>({
		flexGrow: 1,
		width: 0,
	}),
	swipeRemoveActionContainer: new Style<View>({
		alignItems: 'center',
		bottom: 0,
		justifyContent: 'center',
		opacity: 0,
		position: 'absolute',
		right: -10,
		top: 0,
	}),
	swipeRemoveActionIcon: new Style<ImageView>({
		height: 20,
		width: 20,
	}),
	textBlock: new Style<Layout>({
		flexGrow: 1,
		flexShrink: 1,
		paddingLeft: 10,
	}),
};
