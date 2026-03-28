// @ts-nocheck
import { StatefulComponent } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import { TouchEventState } from 'valdi_tsx/src/GestureEvents';
import type { ImageView, Label } from 'valdi_tsx/src/NativeTemplateElements';
import type { Track } from '../../models/Track';
import type { Palette } from '../../services/color/types';
import type { ImageCache } from '../../services/ImageCache';
import { theme } from '../../theme';
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
	longPressTimerId: ReturnType<typeof setTimeout> | null;
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
const resolvedStylesCache = new Map<string, TrackListResolvedStyles>();

export class TrackList extends StatefulComponent<TrackListViewModel, TrackListState> {
	private suppressNextTap = false;

	state: TrackListState = {
		longPressTimerId: null,
	};

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
			{this.viewModel.tracks.map((entry: TrackListEntry) => (
				<view
					accessibilityLabel={`track-row-${entry.id}`}
					contentDescription={`track-row-${entry.id}`}
					key={entry.id}
					onTap={() => {
						if (this.suppressNextTap) {
							this.suppressNextTap = false;
							return;
						}
						this.viewModel.onTrackTap?.(entry.id);
					}}
					onTouch={
						this.viewModel.onTrackLongPress && entry.track
							? ((track) => (event) => {
									this.handleTouch(event, track);
								})(entry.track)
							: undefined
					}
					style={resolvedStyles.rowStyle}
					testID={`track-row-${entry.id}`}
				>
					<layout style={styles.rowContent}>
						{entry.artworkSource ? (
							<view style={resolvedStyles.artworkTileStyle}>
								<CachedImage
									category='album_art'
									imageCache={this.viewModel.imageCache}
									objectFit='cover'
									style={styles.artwork}
									url={entry.artworkSource}
								/>
							</view>
						) : entry.leadingLabel ? (
							<view style={styles.leadingLabelTile}>
								<label style={resolvedStyles.leadingLabelTextStyle} value={entry.leadingLabel} />
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
			))}
		</layout>;
	}

	private handleTouch(event: { state: TouchEventState }, track: Track): void {
		if (event.state === TouchEventState.Started) {
			const timerId = setTimeout(() => {
				this.suppressNextTap = true;
				this.setState({ longPressTimerId: null });
				this.viewModel.onTrackLongPress?.(track);
			}, LONG_PRESS_DELAY_MS);
			this.setState({ longPressTimerId: timerId });
			return;
		}

		if (
			event.state === TouchEventState.Changed ||
			event.state === TouchEventState.Ended ||
			event.state === TouchEventState.Cancelled
		) {
			if (this.state.longPressTimerId !== null) {
				clearTimeout(this.state.longPressTimerId);
				this.setState({ longPressTimerId: null });
			}
		}
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
	textBlock: new Style({
		flex: 1,
		flexShrink: 1,
		paddingLeft: 10,
	}),
};
