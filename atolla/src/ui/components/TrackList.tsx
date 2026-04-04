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
	onTrackSwipeRemove?: (trackId: string, entryIndex: number) => void;
	onTrackTap?: (trackId: string) => void;
	palette?: Palette;
	showDragHandles?: boolean;
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
const resolvedStylesCache = new Map<string, TrackListResolvedStyles>();

export class TrackList extends Component<TrackListViewModel> {
	private suppressNextTap = false;
	private rowOffsetByIdentity = new Map<string, number>();
	private rowRefByIdentity = new Map<string, ElementRef>();

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
				const canSwipe = Boolean(this.viewModel.onTrackSwipeRemove);

				return (
					<view key={rowIdentity} style={styles.swipeContainer}>
						{/* biome-ignore lint/a11y/noStaticElementInteractions: Track rows are intentionally interactive. */}
						<view
							accessibilityLabel={`track-row-${rowIdentity}`}
							contentDescription={`track-row-${rowIdentity}`}
							onDrag={
								canSwipe
									? ((trackId, entryIndex, identity) => (event) => {
											this.handleRowDrag(event, trackId, entryIndex, identity);
										})(entry.id, index, rowIdentity)
									: undefined
							}
							onDragDisabled={!canSwipe}
							onDragPredicate={(event) => Math.abs(event.deltaX) > Math.abs(event.deltaY)}
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

								{this.viewModel.showDragHandles ? (
									<view
										onLongPress={
											entry.track && this.viewModel.onTrackLongPress
												? ((track) => () => {
														Device.performHapticFeedback(DeviceHapticFeedbackType.SELECTION);
														this.viewModel.onTrackLongPress?.(track);
													})(entry.track)
												: undefined
										}
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
		if (event.state === TouchEventState.Changed) {
			const offset = Math.max(-MAX_SWIPE_DISTANCE, Math.min(0, event.deltaX));
			this.setRowOffset(rowIdentity, offset);
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
	editHandleContainer: new Style({
		alignItems: 'center',
		justifyContent: 'center',
		marginLeft: 'auto',
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
