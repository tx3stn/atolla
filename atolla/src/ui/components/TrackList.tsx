// @ts-nocheck
import { Component } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { ImageView, Label } from 'valdi_tsx/src/NativeTemplateElements';
import type { Track } from '../../models/Track';
import { theme } from '../../theme';

export interface TrackListEntry {
	artworkSource?: string | null;
	id: string;
	leadingLabel?: string | null;
	meta: string;
	title: string;
}

interface TrackListViewModel {
	onTrackTap?: (trackId: string) => void;
	tracks: Array<TrackListEntry>;
}

export class TrackList extends Component<TrackListViewModel> {
	onRender() {
		if (this.viewModel.tracks.length === 0) {
			<label key='track-list-empty' style={styles.emptyState} value='No tracks found.' />;
			return;
		}

		<layout style={styles.list}>
			{this.viewModel.tracks.map((track: Track) => (
				<view
					accessibilityLabel={`track-row-${track.id}`}
					contentDescription={`track-row-${track.id}`}
					key={track.id}
					onTap={() => {
						this.viewModel.onTrackTap?.(track.id);
					}}
					style={styles.row}
					testID={`track-row-${track.id}`}
				>
					<layout style={styles.rowContent}>
						{track.artworkSource ? (
							<view style={styles.artworkTile}>
								<image objectFit='cover' src={track.artworkSource} style={styles.artwork} />
							</view>
						) : track.leadingLabel ? (
							<view style={styles.leadingLabelTile}>
								<label style={styles.leadingLabelText} value={track.leadingLabel} />
							</view>
						) : null}

						<layout style={styles.textBlock}>
							<label
								ellipsizeMode='tail'
								numberOfLines={1}
								style={styles.title}
								value={track.title}
							/>
							<label
								ellipsizeMode='tail'
								numberOfLines={1}
								style={styles.meta}
								value={track.meta}
							/>
						</layout>
					</layout>
				</view>
			))}
		</layout>;
	}
}

const styles = {
	artwork: new Style<ImageView>({
		borderRadius: theme.borderRadius,
		height: '100%',
		width: '100%',
	}),
	artworkTile: new Style({
		aspectRatio: 1,
		backgroundColor: theme.colors.bgDeep,
		borderRadius: theme.borderRadius,
		overflow: 'hidden',
		width: 38,
	}),
	emptyState: new Style<Label>({
		...theme.text.sub,
		padding: 8,
	}),
	leadingLabelText: new Style<Label>({
		...theme.text.main,
		textAlign: 'center',
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
	meta: new Style<Label>({
		...theme.text.sub,
		marginTop: 3,
	}),
	row: new Style({
		backgroundColor: theme.colors.bg,
		borderRadius: theme.borderRadius,
		paddingBottom: 8,
		paddingLeft: 10,
		paddingRight: 10,
		paddingTop: 8,
		rowGap: 4,
	}),
	rowContent: new Style({
		alignItems: 'center',
		columnGap: 18,
		flexDirection: 'row',
		width: '100%',
	}),
	textBlock: new Style({
		flex: 1,
		paddingLeft: 10,
	}),
	title: new Style<Label>({
		...theme.text.main,
	}),
};
