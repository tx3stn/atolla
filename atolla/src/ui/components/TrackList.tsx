import res from 'atolla/res';
import { AnimationCurve } from 'valdi_core/src/AnimationOptions';
import { Component } from 'valdi_core/src/Component';
import { ElementRef } from 'valdi_core/src/ElementRef';
import { Style } from 'valdi_core/src/Style';
import type { DragEvent } from 'valdi_tsx/src/GestureEvents';
import type { ImageView, Label, Layout, View } from 'valdi_tsx/src/NativeTemplateElements';
import type { Track } from '../../models/Track';
import Strings from '../../Strings';
import type { Palette } from '../../services/color/types';
import type { ImageCache } from '../../services/ImageCache';
import { theme, withAlpha } from '../../theme';
import { hapticFeedback } from '../haptics';
import { CachedImage } from './CachedImage';
import { TouchEventState } from './TouchEventState';

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
const REORDER_STEP_HEIGHT = 64;
const ROW_SLOT_HEIGHT = REORDER_STEP_HEIGHT + 8; // row height + gap between rows

export class TrackList extends Component<TrackListViewModel> {
	private draggingRowIdentities = new Set<string>();
	private pulseOverlayStyle = buildPulseOverlayStyle(undefined);
	private dragHandleRefByIdentity = new Map<string, ElementRef>();
	private handleBeingPressedIdentity: string | null = null;
	private hasBeenDestroyed = false;
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

	onDestroy(): void {
		this.hasBeenDestroyed = true;
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
		this.removeAnimationTimeout = setTimeout(() => {
			this.removeAnimationTimeout = null;
			if (this.hasBeenDestroyed) return;
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

			this.removeAnimationTimeout = setTimeout(() => {
				this.removeAnimationTimeout = null;
				if (this.hasBeenDestroyed) return;
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
			for (let i = 0; i < this.viewModel.tracks.length; i++) {
				const ref = this.swipeContainerRefByIdentity.get(`${this.viewModel.tracks[i].id}-${i}`);
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

				return (
					<view
						accessibilityLabel={`track-row-drag-${rowIdentity}`}
						key={rowIdentity}
						onDrag={
							this.viewModel.onTrackReorder
								? ((entryIndex, identity, rowBg, activeDragColor) => (event) => {
										this.handleHandleDrag(event, entryIndex, identity, rowBg, activeDragColor);
									})(index, rowIdentity, colors.rowBackground, dragHighlightColor)
								: undefined
						}
						onDragDisabled={!this.viewModel.onTrackReorder}
						onDragPredicate={(
							(identity) => (event) =>
								((this.handleBeingPressedIdentity === identity &&
									this.draggingRowIdentities.size === 0) ||
									this.draggingRowIdentities.has(identity)) &&
								Math.abs(event.deltaY) > Math.abs(event.deltaX)
						)(rowIdentity)}
						ref={this.getSwipeContainerRef(rowIdentity)}
						style={styles.swipeContainer}
					>
						{canSwipe && this.viewModel.showDragHandles ? (
							<view
								accessibilityLabel={`track-row-remove-action-${rowIdentity}`}
								ref={this.getRemoveActionRef(rowIdentity)}
								style={styles.swipeRemoveActionContainer}
							>
								<image
									accessibilityLabel={`track-row-remove-icon-${rowIdentity}`}
									src={res.trash}
									style={styles.swipeRemoveActionIcon}
									tint={theme.colors.destructive}
								/>
							</view>
						) : null}
						<view
							accessibilityLabel={`track-row-${rowIdentity}`}
							ref={this.getRowRef(rowIdentity)}
							style={resolvedStyles.rowStyle}
						>
							<view ref={this.getPulseOverlayRef(rowIdentity)} style={this.pulseOverlayStyle} />
							<layout style={styles.rowInteractiveLayout}>
								<view
									accessibilityLabel={`track-row-swipe-region-${rowIdentity}`}
									onDrag={
										canSwipe
											? ((trackId, entryIndex, identity) => (event) => {
													this.handleRowDrag(event, trackId, entryIndex, identity);
												})(entry.id, index, rowIdentity)
											: undefined
									}
									onDragDisabled={!canSwipe}
									onDragPredicate={(event) =>
										this.draggingRowIdentities.size === 0 &&
										Math.abs(event.deltaX) > Math.abs(event.deltaY)
									}
									onTap={() => {
										if (this.suppressNextTap) {
											this.suppressNextTap = false;
											return;
										}
										this.performSelectionHaptic();
										this.triggerTapPulse(rowIdentity);
										this.viewModel.onTrackTap?.(entry.id);
									}}
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
										accessibilityLabel={`track-row-edit-handle-${rowIdentity}`}
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
											this.viewModel.onTrackReorder
												? ((identity) => (event) => {
														if (event.state === TouchEventState.Started) {
															this.handleBeingPressedIdentity = identity;
														} else if (event.state !== TouchEventState.Changed) {
															if (this.handleBeingPressedIdentity === identity) {
																this.handleBeingPressedIdentity = null;
															}
														}
													})(rowIdentity)
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

		if (isDragging) {
			this.draggingRowIdentities.add(identity);
			rowRef.setAttribute('zIndex', 20);
			rowRef.setAttribute('elevation', 12);
			rowRef.setAttribute('backgroundColor', dragBackgroundColor);
			containerRef?.setAttribute('zIndex', 100);
			return;
		}

		this.draggingRowIdentities.delete(identity);
		this.handleBeingPressedIdentity = null;
		rowRef.setAttribute('zIndex', 0);
		rowRef.setAttribute('elevation', 0);
		rowRef.setAttribute('backgroundColor', defaultBackgroundColor);
		containerRef?.setAttribute('zIndex', 0);
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

	private updateNeighborOffsets(draggingIndex: number, targetStep: number): void {
		const lastIndex = this.viewModel.tracks.length - 1;
		const clampedStep = Math.max(-draggingIndex, Math.min(lastIndex - draggingIndex, targetStep));

		for (let i = 0; i < this.rowIdentitiesByIndex.length; i++) {
			if (i === draggingIndex) continue;
			const identity = this.rowIdentitiesByIndex[i];
			if (!identity) continue;

			let offset = 0;
			if (clampedStep > 0 && i > draggingIndex && i <= draggingIndex + clampedStep) {
				offset = -ROW_SLOT_HEIGHT;
			} else if (clampedStep < 0 && i < draggingIndex && i >= draggingIndex + clampedStep) {
				offset = ROW_SLOT_HEIGHT;
			}

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
			this.setRowDraggingAppearance(rowIdentity, true, defaultBackgroundColor, dragBackgroundColor);
			return;
		}

		if (event.state === TouchEventState.Changed) {
			if (!this.draggingRowIdentities.has(rowIdentity)) {
				this.setRowDraggingAppearance(
					rowIdentity,
					true,
					defaultBackgroundColor,
					dragBackgroundColor,
				);
			}
			this.setRowVerticalOffset(rowIdentity, event.deltaY);
			this.updateNeighborOffsets(entryIndex, Math.round(event.deltaY / REORDER_STEP_HEIGHT));
			return;
		}

		if (event.state !== TouchEventState.Ended) {
			this.setRowVerticalOffset(rowIdentity, 0);
			this.resetNeighborOffsets(rowIdentity);
			this.setRowDraggingAppearance(
				rowIdentity,
				false,
				defaultBackgroundColor,
				dragBackgroundColor,
			);
			return;
		}

		const movementSteps = Math.round(event.deltaY / REORDER_STEP_HEIGHT);
		const lastIndex = this.viewModel.tracks.length - 1;
		const targetIndex = Math.max(0, Math.min(lastIndex, entryIndex + movementSteps));

		if (targetIndex === entryIndex) {
			this.setRowVerticalOffset(rowIdentity, 0);
			this.resetNeighborOffsets(rowIdentity);
			this.setRowDraggingAppearance(
				rowIdentity,
				false,
				defaultBackgroundColor,
				dragBackgroundColor,
			);
			return;
		}

		// Snap dragged row to its final slot; leave neighbors shifted — the re-render
		// from onTrackReorder will replace this state seamlessly without a flash.
		this.setRowVerticalOffset(rowIdentity, (targetIndex - entryIndex) * ROW_SLOT_HEIGHT);
		this.setRowDraggingAppearance(rowIdentity, false, defaultBackgroundColor, dragBackgroundColor);
		this.resetRowOffset(rowIdentity);
		this.suppressNextTap = true;
		// Clear stale offset tracking so future drags don't skip animations for
		// elements that happen to share an identity with a previous neighbor.
		for (const timeout of this.neighborBounceTimeouts.values()) clearTimeout(timeout);
		this.neighborBounceTimeouts.clear();
		this.neighborOffsetByIdentity.clear();
		this.viewModel.onTrackReorder(entryIndex, targetIndex);
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
			borderRadius: theme.borderRadius / 2,
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
			borderRadius: theme.borderRadius,
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
		borderRadius: theme.borderRadius,
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
		borderRadius: theme.borderRadius / 2,
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
