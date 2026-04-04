// @ts-nocheck
import { StatefulComponent } from 'valdi_core/src/Component';
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
	onTrackSwipeRemove?: (trackId: string, entryIndex: number) => void;
	onTrackTap?: (trackId: string) => void;
	palette?: Palette;
	tracks: Array<TrackListEntry>;
}

interface TrackListColors {
	meta: string;
	rowBackground: string;
	tileBackground: string;
	title: string;
}

interface TrackListState {
	isEditMode: boolean;
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

const LONG_PRESS_DELAY_MS = 500;
const MAX_SWIPE_DISTANCE = 88;
const REMOVE_SWIPE_DISTANCE = 64;
const REMOVE_SWIPE_VELOCITY = 700;
const resolvedStylesCache = new Map<string, TrackListResolvedStyles>();

export class TrackList extends StatefulComponent<TrackListViewModel, TrackListState> {
	private suppressNextTap = false;
	private longPressTimerId: ReturnType<typeof setTimeout> | null = null;
	private rowOffsetByIdentity = new Map<string, number>();
	private rowRefByIdentity = new Map<string, ElementRef>();
	private artworkTouchActive = false;

	state: TrackListState = {
		isEditMode: false,
	};

	onDestroy(): void {
		this.clearLongPressTimer();
	}

	onRender() {
		const colors = resolveColors(this.viewModel.palette, this.viewModel.noRowBackground);
		const resolvedStyles = getResolvedTrackListStyles(colors);

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

				return (
					<view key={rowIdentity} style={styles.swipeContainer}>
						{/* biome-ignore lint/a11y/noStaticElementInteractions: Track rows are intentionally interactive. */}
						<view
							accessibilityLabel={`track-row-${rowIdentity}`}
							contentDescription={`track-row-${rowIdentity}`}
							onDrag={
								this.state.isEditMode
									? ((trackId, entryIndex, identity) => (event) => {
											this.handleRowDrag(event, trackId, entryIndex, identity);
										})(entry.id, index, rowIdentity)
									: undefined
							}
							onDragEnabled={this.state.isEditMode}
							onTap={() => {
								if (this.suppressNextTap) {
									this.suppressNextTap = false;
									return;
								}
								this.viewModel.onTrackTap?.(entry.id);
							}}
							ref={this.getRowRef(rowIdentity)}
							style={resolvedStyles.rowStyle}
							testID={`track-row-${rowIdentity}`}
						>
							<layout style={styles.rowContent}>
								{entry.artworkSource ? (
									<view
										onTouch={
											entry.track
												? ((track) => (event) => {
														this.handleArtworkTouch(event, track);
													})(entry.track)
												: undefined
										}
										style={resolvedStyles.artworkTileStyle}
										testID={`track-artwork-touch-${rowIdentity}`}
									>
										<CachedImage
											category='album_art'
											imageCache={this.viewModel.imageCache}
											objectFit='cover'
											style={styles.artwork}
											url={entry.artworkSource}
										/>
									</view>
								) : entry.leadingLabel ? (
									<view
										onTouch={
											this.viewModel.onTrackLongPress && entry.track
												? ((track) => (event) => {
														this.handleRowTouch(event, track);
													})(entry.track)
												: undefined
										}
										style={styles.leadingLabelTile}
										testID={`track-row-non-artwork-touch-${rowIdentity}`}
									>
										<label
											style={resolvedStyles.leadingLabelTextStyle}
											value={entry.leadingLabel}
										/>
									</view>
								) : null}

								<layout
									onTouch={
										this.viewModel.onTrackLongPress && entry.track
											? ((track) => (event) => {
													this.handleRowTouch(event, track);
												})(entry.track)
											: undefined
									}
									style={styles.textBlock}
									testID={`track-row-non-artwork-touch-${rowIdentity}`}
								>
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

								{this.state.isEditMode ? (
									<view
										onTouch={
											this.viewModel.onTrackLongPress && entry.track
												? ((track) => (event) => {
														this.handleRowTouch(event, track);
													})(entry.track)
												: undefined
										}
										style={styles.editHandleContainer}
										testID={`track-row-edit-handle-${rowIdentity}`}
									>
										<layout style={styles.editHandleColumn}>
											<view style={styles.editHandleDot} />
											<view style={styles.editHandleDot} />
										</layout>
										<layout style={styles.editHandleColumn}>
											<view style={styles.editHandleDot} />
											<view style={styles.editHandleDot} />
										</layout>
									</view>
								) : null}
							</layout>
						</view>
					</view>
				);
			})}
		</layout>;
	}

	private clearLongPressTimer(): void {
		if (this.longPressTimerId === null) {
			return;
		}
		clearTimeout(this.longPressTimerId);
		this.longPressTimerId = null;
	}

	private startLongPressTimer(action: () => void): void {
		this.clearLongPressTimer();
		this.longPressTimerId = setTimeout(() => {
			this.suppressNextTap = true;
			this.longPressTimerId = null;
			action();
		}, LONG_PRESS_DELAY_MS);
	}

	private handleArtworkTouch(event: { state: TouchEventState }, _track: Track): void {
		if (event.state === TouchEventState.Started) {
			this.artworkTouchActive = true;
			this.startLongPressTimer(() => {
				this.setState({ isEditMode: true });
			});
			return;
		}

		if (event.state === TouchEventState.Ended) {
			this.artworkTouchActive = false;
			this.clearLongPressTimer();
		}
	}

	private handleRowTouch(event: { state: TouchEventState }, track: Track): void {
		if (event.state === TouchEventState.Started) {
			if (this.artworkTouchActive) {
				return;
			}
			this.startLongPressTimer(() => {
				this.viewModel.onTrackLongPress?.(track);
			});
			return;
		}

		if (event.state === TouchEventState.Ended) {
			this.clearLongPressTimer();
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

	private setRowOffset(identity: string, offset: number): void {
		const rowRef = this.rowRefByIdentity.get(identity);
		if (!rowRef) {
			return;
		}
		this.rowOffsetByIdentity.set(identity, offset);
		rowRef.setAttribute('left', offset);
		rowRef.setAttribute('right', -offset);
	}

	private resetRowOffset(identity: string): void {
		this.setRowOffset(identity, 0);
	}

	private handleRowDrag(event, trackId: string, entryIndex: number, rowIdentity: string): void {
		if (!this.state.isEditMode) {
			return;
		}

		if (event.state === TouchEventState.Changed) {
			if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
				return;
			}
			const offset = Math.max(-MAX_SWIPE_DISTANCE, Math.min(0, event.deltaX));
			this.setRowOffset(rowIdentity, offset);
			return;
		}

		if (event.state !== TouchEventState.Ended) {
			return;
		}

		if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
			this.resetRowOffset(rowIdentity);
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
			width: '100%',
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
			width: '100%',
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
	editHandleColumn: new Style({
		rowGap: 4,
	}),
	editHandleContainer: new Style({
		columnGap: 4,
		flexDirection: 'row',
		marginLeft: 8,
		paddingBottom: 4,
		paddingLeft: 6,
		paddingRight: 2,
		paddingTop: 4,
	}),
	editHandleDot: new Style({
		backgroundColor: withAlpha(theme.colors.white, 0.58),
		borderRadius: 2,
		height: 4,
		width: 4,
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
		flexDirection: 'row',
		width: '100%',
	}),
	swipeContainer: new Style({
		overflow: 'hidden',
		position: 'relative',
		width: '100%',
	}),
	textBlock: new Style({
		flex: 1,
		flexShrink: 1,
		paddingLeft: 10,
	}),
};
