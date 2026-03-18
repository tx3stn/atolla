// @ts-nocheck
import res from 'atolla/res';
import { Component } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { ImageView, Label } from 'valdi_tsx/src/NativeTemplateElements';
import { theme } from '../../theme';

export interface DetailHeaderViewModel {
	artworkSource: string | null;
	fallbackText?: string | null;
	logoSource?: string | null;
	onPlay?: () => void;
	onShuffle?: () => void;
}

export class DetailHeader extends Component<DetailHeaderViewModel> {
	onRender() {
		const { artworkSource, fallbackText, logoSource, onPlay, onShuffle } = this.viewModel;

		<layout style={styles.root}>
			<view style={styles.artworkTile}>
				{artworkSource && (
					<image objectFit='cover' src={artworkSource} style={styles.artworkImage} />
				)}
			</view>
			<layout style={styles.rightColumn}>
				<view style={styles.logoArea}>
					{logoSource ? (
						<image objectFit='contain' src={logoSource} style={styles.logoImage} />
					) : fallbackText ? (
						<label numberOfLines={0} style={styles.fallbackText} value={fallbackText} />
					) : null}
				</view>
				<layout style={styles.buttonsRow}>
					<view onTap={onShuffle} style={styles.button}>
						<image src={res.shuffle} style={styles.buttonIcon} tint={theme.colors.white} />
					</view>
					<view onTap={onPlay} style={styles.button}>
						<image src={res.play} style={styles.buttonIcon} tint={theme.colors.white} />
					</view>
				</layout>
			</layout>
		</layout>;
	}
}

const styles = {
	artworkImage: new Style<ImageView>({
		borderRadius: theme.borderRadius,
		height: '100%',
		width: '100%',
	}),
	artworkTile: new Style({
		aspectRatio: 1,
		backgroundColor: theme.colors.bgAccent,
		borderRadius: theme.borderRadius,
		overflow: 'hidden',
		width: '50%',
	}),
	button: new Style({
		alignItems: 'center',
		justifyContent: 'center',
		padding: 8,
	}),
	buttonIcon: new Style<ImageView>({
		height: 24,
		width: 24,
	}),
	buttonsRow: new Style({
		bottom: 0,
		flexDirection: 'row',
		padding: 6,
		position: 'absolute',
		right: 0,
	}),
	fallbackText: new Style<Label>({
		...theme.text.display,
		padding: 12,
	}),
	logoArea: new Style({
		overflow: 'hidden',
		width: '100%',
	}),
	logoImage: new Style<ImageView>({
		height: '100%',
		width: '100%',
	}),
	rightColumn: new Style({
		alignSelf: 'stretch',
		flexDirection: 'column',
		marginLeft: 12,
		width: '46%',
	}),
	root: new Style({
		alignItems: 'stretch',
		flexDirection: 'row',
		marginBottom: 12,
		padding: 4,
		width: '100%',
	}),
};
