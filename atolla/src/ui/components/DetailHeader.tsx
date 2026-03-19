// @ts-nocheck
import res from 'atolla/res';
import { Component } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { ImageView, Label } from 'valdi_tsx/src/NativeTemplateElements';
import { theme } from '../../theme';

export interface DetailHeaderViewModel {
	artworkSource: string | null;
	buttonText: string | null;
	fallbackText?: string | null;
	logoSource?: string | null;
	onPlay?: () => void;
	onShuffle?: () => void;
	subheaderLeft?: string | null;
	subheaderRight?: string | null;
}

export class DetailHeader extends Component<DetailHeaderViewModel> {
	onRender() {
		const {
			artworkSource,
			buttonText,
			fallbackText,
			logoSource,
			onPlay,
			onShuffle,
			subheaderLeft,
			subheaderRight,
		} = this.viewModel;

		<layout style={styles.root}>
			<layout style={styles.headerRow}>
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
						<label style={styles.buttonText} value={buttonText ?? ''} />
						<view onTap={onShuffle} style={styles.button}>
							<image src={res.shuffle} style={styles.buttonIcon} tint={theme.colors.white} />
						</view>
						<view onTap={onPlay} style={styles.button}>
							<image src={res.play} style={styles.buttonIcon} tint={theme.colors.white} />
						</view>
					</layout>
				</layout>
			</layout>
			{(subheaderLeft || subheaderRight) && (
				<layout style={styles.subheaderRow}>
					<label style={styles.subheaderLeftText} value={subheaderLeft ?? ''} />
					{subheaderRight && <label style={styles.subheaderRightText} value={subheaderRight} />}
				</layout>
			)}
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
		left: 0,
		padding: 6,
		position: 'absolute',
		right: 0,
	}),
	buttonText: new Style<Label>({
		...theme.text.sub,
		flexGrow: 1,
		textAlign: 'left',
	}),
	fallbackText: new Style<Label>({
		...theme.text.display,
		padding: 12,
	}),
	headerRow: new Style({
		alignItems: 'stretch',
		flexDirection: 'row',
		width: '100%',
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
		marginBottom: 12,
		padding: 4,
		width: '100%',
	}),
	subheaderLeftText: new Style<Label>({
		...theme.text.display,
		marginLeft: 12,
		marginTop: 12,
		padding: 4,
	}),
	subheaderRightText: new Style<Label>({
		...theme.text.sub,
		marginTop: 10,
		padding: 4,
	}),
	subheaderRow: new Style({
		flexDirection: 'row',
		justifyContent: 'space-between',
		marginTop: 8,
		paddingHorizontal: 4,
		width: '100%',
	}),
};
