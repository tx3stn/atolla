// @ts-nocheck
import { Component } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { ImageView, Label } from 'valdi_tsx/src/NativeTemplateElements';
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
}

interface TrackListViewModel {
	imageCache?: ImageCache;
	noRowBackground?: boolean;
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

const defaultColors: TrackListColors = {
	meta: theme.text.sub.color,
	rowBackground: theme.colors.bg,
	tileBackground: theme.colors.bgDeep,
	title: theme.text.main.color,
};

export class TrackList extends Component<TrackListViewModel> {
	onRender() {
		const colors = resolveColors(this.viewModel.palette, this.viewModel.noRowBackground);
		const emptyStateStyle = new Style<Label>({
			...theme.text.sub,
			color: colors.meta,
			padding: 8,
			textAlign: 'center',
		});
		const leadingLabelTextStyle = new Style<Label>({
			...theme.text.main,
			color: colors.title,
			textAlign: 'center',
		});
		const titleStyle = new Style<Label>({
			...theme.text.mainBold,
			color: colors.title,
			flexShrink: 1,
			width: '100%',
		});
		const metaStyle = new Style<Label>({
			...theme.text.sub,
			color: colors.meta,
			flexShrink: 1,
			marginTop: 3,
			width: '100%',
		});
		const rowStyle = new Style({
			backgroundColor: colors.rowBackground,
			borderRadius: theme.borderRadius,
			paddingBottom: 8,
			paddingLeft: 10,
			paddingRight: 10,
			paddingTop: 8,
			rowGap: 4,
		});
		const artworkTileStyle = new Style({
			aspectRatio: 1,
			backgroundColor: colors.tileBackground,
			borderRadius: theme.borderRadius,
			overflow: 'hidden',
			width: 42,
		});

		if (this.viewModel.tracks.length === 0) {
			<label key='track-list-empty' style={emptyStateStyle} value='nothing else lined up' />;
			return;
		}

		<layout style={styles.list}>
			{this.viewModel.tracks.map((track: TrackListEntry) => (
				<view
					accessibilityLabel={`track-row-${track.id}`}
					contentDescription={`track-row-${track.id}`}
					key={track.id}
					onTap={() => {
						this.viewModel.onTrackTap?.(track.id);
					}}
					style={rowStyle}
					testID={`track-row-${track.id}`}
				>
					<layout style={styles.rowContent}>
						{track.artworkSource ? (
							<view style={artworkTileStyle}>
								<CachedImage
									category='album_art'
									imageCache={this.viewModel.imageCache}
									objectFit='cover'
									style={styles.artwork}
									url={track.artworkSource}
								/>
							</view>
						) : track.leadingLabel ? (
							<view style={styles.leadingLabelTile}>
								<label style={leadingLabelTextStyle} value={track.leadingLabel} />
							</view>
						) : null}

						<layout style={styles.textBlock}>
							<label
								ellipsizeMode='tail'
								numberOfLines={2}
								style={titleStyle}
								value={track.title}
							/>
							<label ellipsizeMode='tail' numberOfLines={1} style={metaStyle} value={track.meta} />
						</layout>
					</layout>
				</view>
			))}
		</layout>;
	}
}

function resolveColors(palette?: Palette, noRowBackground?: boolean): TrackListColors {
	if (!palette) {
		return defaultColors;
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
