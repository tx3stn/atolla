// @ts-nocheck

import res from 'atolla/res';
import { Component } from 'valdi_core/src/Component';
import { Device, DeviceHapticFeedbackType } from 'valdi_core/src/Device';
import { ElementRef } from 'valdi_core/src/ElementRef';
import { Style } from 'valdi_core/src/Style';
import type { ImageView, Label } from 'valdi_tsx/src/NativeTemplateElements';

const TouchEventState = { Changed: 1, Ended: 2, Started: 0 } as const;

import type { Track } from '../../models/Track';
import type { Palette } from '../../services/color/types';
import type { ImageCache } from '../../services/ImageCache';
import { theme, withAlpha } from '../../theme';
import { CachedImage } from './CachedImage';

export interface TrackListEntry {
	artworkSource?: string | null;
	id: string;
	leadingLabel?: string | null;
	meta: string;
	title: string;
	track?: Track;
}

export interface TrackListViewModel {
	imageCache?: ImageCache;
	noRowBackground?: boolean;
	onTrackLongPress?: (track: Track) => void;
	onTrackReorder?: (fromEntryIndex: number, toEntryIndex: number) => void;
	onTrackSwipeRemove?: (trackId: string, entryIndex: number) => void;
	onTrackTap?: (trackId: string) => void;
	palette?: Palette;
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
	artworkTileStyle: Style;
	emptyStateStyle: Style<Label>;
	leadingLabelTextStyle: Style<Label>;
	metaStyle: Style<Label>;
	rowStyle: Style;
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
const resolvedStylesCache = new Map<string, TrackListResolvedStyles>();

export class TrackList extends Component<TrackListViewModel> {
	private draggingRowIdentities = new Set<string>();
	private dragHandleRefByIdentity = new Map<string, ElementRef>();
	private handleBeingPressedIdentity: string | null = null;
	private longPressTimeout: ReturnType<typeof setTimeout> | null = null;
	private pulseOverlayRefByIdentity = new Map<string, ElementRef>();
	private removeActionRefByIdentity = new Map<string, ElementRef>();
	private suppressNextTap = false;
	private rowOffsetByIdentity = new Map<string, number>();
	private rowRefByIdentity = new Map<string, ElementRef>();
	private swipeContainerRefByIdentity = new Map<string, ElementRef>();

	onRender() {
		const colors = resolveColors(this.viewModel.palette, this.viewModel.noRowBackground);
		const dragHighlightColor = withAlpha(
			this.viewModel.palette?.accent.hex ?? theme.colors.active,
			0.28,
		);
		const resolvedStyles = getResolvedTrackListStyles(colors);
		const pulseColor = this.viewModel.tapPulseColor ?? theme.colors.white;
		const pulseOverlayStyle = new Style({
			backgroundColor: pulseColor,
			borderRadius: theme.borderRadius,
			bottom: 0,
			left: 0,
			opacity: 0,
			position: 'absolute',
			right: 0,
			top: 0,
		});

		if (this.viewModel.tracks.length === 0) {
			<label
				key='track-list-empty'
				style={resolvedStyles.emptyStateStyle}
				value='nothing else lined up'
			/>;
			return;
		}

		<layout style={styles.list}>
			{this.viewModel.tracks.map((entry: TrackListEntry, index: number) => {
				const rowIdentity = `${entry.id}-${index}`;
				const canSwipe = Boolean(this.viewModel.onTrackSwipeRemove);

				return (
					// biome-ignore lint/a11y/noStaticElementInteractions: container owns vertical drag to decouple gesture from moving inner row
					<view
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
								ref={this.getRemoveActionRef(rowIdentity)}
								style={styles.swipeRemoveActionContainer}
								testID={`track-row-remove-action-${rowIdentity}`}
							>
								<image
									src={res.trash}
									style={styles.swipeRemoveActionIcon}
									testID={`track-row-remove-icon-${rowIdentity}`}
									tint={theme.colors.destructive}
								/>
							</view>
						) : null}
						<view
							ref={this.getRowRef(rowIdentity)}
							style={resolvedStyles.rowStyle}
							testID={`track-row-${rowIdentity}`}
						>
							<view ref={this.getPulseOverlayRef(rowIdentity)} style={pulseOverlayStyle} />
							<layout style={styles.rowInteractiveLayout}>
								{/* biome-ignore lint/a11y/noStaticElementInteractions: Track rows are intentionally interactive. */}
								<view
									accessibilityLabel={`track-row-swipe-region-${rowIdentity}`}
									contentDescription={`track-row-swipe-region-${rowIdentity}`}
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
										this.triggerTapPulse(rowIdentity);
										this.viewModel.onTrackTap?.(entry.id);
									}}
									onTouch={
										entry.track && this.viewModel.onTrackLongPress
											? ((track) => (event) => {
													this.handleTrackTouch(event, track);
												})(entry.track)
											: undefined
									}
									style={styles.swipeGestureRegion}
									testID={`track-row-swipe-region-${rowIdentity}`}
								>
									<layout style={styles.rowContent}>
										{entry.artworkSource ? (
											<view
												style={resolvedStyles.artworkTileStyle}
												testID={`track-artwork-touch-${rowIdentity}`}
											>
												<CachedImage
													category='album_art_thumb'
													imageCache={this.viewModel.imageCache}
													objectFit='cover'
													style={styles.artwork}
													url={entry.artworkSource}
												/>
											</view>
										) : entry.leadingLabel ? (
											<view
												style={styles.leadingLabelTile}
												testID={`track-row-non-artwork-touch-${rowIdentity}`}
											>
												<label
													style={resolvedStyles.leadingLabelTextStyle}
													value={entry.leadingLabel}
												/>
											</view>
										) : null}

										<layout style={styles.textBlock}>
											<label
												ellipsizeMode='tail'
												numberOfLines={2}
												style={resolvedStyles.titleStyle}
												value={entry.title}
											/>
											<label
												ellipsizeMode='tail'
												numberOfLines={1}
												style={resolvedStyles.metaStyle}
												value={entry.meta}
											/>
										</layout>
									</layout>
								</view>

								{this.viewModel.showDragHandles ? (
									<view
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
										testID={`track-row-edit-handle-${rowIdentity}`}
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
		setTimeout(() => {
			ref.setAttribute('opacity', 0);
		}, 180);
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
		const rowRef = this.rowRefByIdentity.get(identity);
		if (!rowRef) {
			return;
		}
		const containerRef = this.swipeContainerRefByIdentity.get(identity);

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

	private handleRowDrag(event, trackId: string, entryIndex: number, rowIdentity: string): void {
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
		this.viewModel.onTrackSwipeRemove?.(trackId, entryIndex);
	}

	private handleHandleDrag(
		event,
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
			return;
		}

		if (event.state !== TouchEventState.Ended) {
			this.setRowVerticalOffset(rowIdentity, 0);
			this.setRowDraggingAppearance(
				rowIdentity,
				false,
				defaultBackgroundColor,
				dragBackgroundColor,
			);
			return;
		}

		this.setRowVerticalOffset(rowIdentity, 0);
		this.setRowDraggingAppearance(rowIdentity, false, defaultBackgroundColor, dragBackgroundColor);

		const movementSteps = Math.round(event.deltaY / REORDER_STEP_HEIGHT);
		if (movementSteps === 0) {
			return;
		}

		const lastIndex = this.viewModel.tracks.length - 1;
		const targetIndex = Math.max(0, Math.min(lastIndex, entryIndex + movementSteps));
		if (targetIndex === entryIndex) {
			return;
		}

		this.resetRowOffset(rowIdentity);
		this.suppressNextTap = true;
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
		try {
			const selectionType =
				DeviceHapticFeedbackType?.SELECTION ?? DeviceHapticFeedbackType?.Selection ?? 'selection';
			Device.performHapticFeedback(selectionType);
		} catch {
			// Ignore haptic failures so menu actions still proceed.
		}
	}

	private cancelLongPress(): void {
		if (!this.longPressTimeout) {
			return;
		}
		clearTimeout(this.longPressTimeout);
		this.longPressTimeout = null;
	}

	private handleTrackTouch(event, track?: Track): void {
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
	const cacheKey = [colors.meta, colors.rowBackground, colors.tileBackground, colors.title].join(
		'|',
	);
	const cached = resolvedStylesCache.get(cacheKey);
	if (cached) {
		return cached;
	}

	const created: TrackListResolvedStyles = {
		artworkTileStyle: new Style({
			aspectRatio: 1,
			backgroundColor: colors.tileBackground,
			borderRadius: theme.borderRadius,
			overflow: 'hidden',
			width: 42,
		}),
		emptyStateStyle: new Style<Label>({
			...theme.text.sub,
			color: colors.meta,
			padding: 8,
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
		rowStyle: new Style({
			backgroundColor: colors.rowBackground,
			borderRadius: theme.borderRadius,
			paddingBottom: 8,
			paddingLeft: 10,
			paddingRight: 10,
			paddingTop: 8,
			rowGap: 4,
		}),
		titleStyle: new Style<Label>({
			...theme.text.mainBold,
			color: colors.title,
			flexShrink: 1,
		}),
	};

	resolvedStylesCache.set(cacheKey, created);
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

const styles = {
	artwork: new Style<ImageView>({
		borderRadius: theme.borderRadius / 2,
		height: '100%',
		width: '100%',
	}),
	editHandleContainer: new Style({
		alignItems: 'center',
		justifyContent: 'center',
		paddingLeft: 8,
		paddingRight: 2,
	}),
	editHandleIcon: new Style<ImageView>({
		height: 24,
		width: 24,
	}),
	leadingLabelTile: new Style({
		alignItems: 'center',
		alignSelf: 'flex-start',
		aspectRatio: 1,
		justifyContent: 'flex-start',
		paddingTop: 5,
		width: 38,
	}),
	list: new Style({
		rowGap: 8,
		width: '100%',
	}),
	rowContent: new Style({
		alignItems: 'center',
		columnGap: 18,
		flex: 1,
		flexDirection: 'row',
	}),
	rowInteractiveLayout: new Style({
		alignItems: 'center',
		flexDirection: 'row',
		width: '100%',
	}),
	swipeContainer: new Style({
		overflow: 'hidden',
		position: 'relative',
		width: '100%',
	}),
	swipeGestureRegion: new Style({
		flex: 1,
		flexGrow: 1,
		width: 0,
	}),
	swipeRemoveActionContainer: new Style({
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
	textBlock: new Style({
		flex: 1,
		flexShrink: 1,
		paddingLeft: 10,
	}),
};
