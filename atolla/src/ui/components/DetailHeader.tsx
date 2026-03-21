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
	onDownload?: () => void;
	onPlay?: () => void;
	onShuffle?: () => void;
	subheaderLineOneLeft?: string | null;
	subheaderLineOneRight?: string | null;
	subheaderLineTwoLeft?: string | null;
	subheaderLineTwoRight?: string | null;
}

export class DetailHeader extends Component<DetailHeaderViewModel> {
	onRender() {
		const {
			artworkSource,
			fallbackText,
			logoSource,
			onDownload,
			onPlay,
			onShuffle,
			subheaderLineOneLeft,
			subheaderLineOneRight,
			subheaderLineTwoLeft,
			subheaderLineTwoRight,
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
						{/* download */}
						<view onTap={onDownload} style={styles.button}>
							<image src={res.download} style={styles.buttonIcon} tint={theme.colors.white} />
						</view>
						{/* shuffle */}
						<view onTap={onShuffle} style={styles.button}>
							<image src={res.shuffle} style={styles.buttonIcon} tint={theme.colors.white} />
						</view>
						{/* play */}
						<view onTap={onPlay} style={styles.button}>
							<image src={res.play} style={styles.buttonIcon} tint={theme.colors.white} />
						</view>
					</layout>
				</layout>
			</layout>
			{(subheaderLineOneLeft ||
				subheaderLineOneRight ||
				subheaderLineTwoLeft ||
				subheaderLineTwoRight) && (
				<layout style={styles.subheaderLines}>
					{(subheaderLineOneLeft || subheaderLineOneRight) && (
						<layout style={styles.subheaderLineRow}>
							<label style={styles.subheaderLineOneLeftText} value={subheaderLineOneLeft ?? ''} />
							{subheaderLineOneRight && (
								<label style={styles.subheaderLineOneRightText} value={subheaderLineOneRight} />
							)}
						</layout>
					)}
					{(subheaderLineTwoLeft || subheaderLineTwoRight) && (
						<layout style={styles.subheaderLineRowTwo}>
							<label style={styles.subheaderLineTwoLeftText} value={subheaderLineTwoLeft ?? ''} />
							{subheaderLineTwoRight && (
								<label style={styles.subheaderLineTwoRightText} value={subheaderLineTwoRight} />
							)}
						</layout>
					)}
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
		paddingLeft: 12,
	}),
	buttonIcon: new Style<ImageView>({
		height: 24,
		width: 24,
	}),
	buttonsRow: new Style({
		alignItems: 'center',
		bottom: 0,
		columnGap: 4,
		flexDirection: 'row',
		justifyContent: 'flex-end',
		padding: 6,
		position: 'absolute',
		right: 0,
		width: '100%',
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
	subheaderLineOneLeftText: new Style<Label>({
		...theme.text.display,
		marginLeft: 12,
		marginTop: 10,
		paddingHorizontal: 4,
	}),
	subheaderLineOneRightText: new Style<Label>({
		...theme.text.sub,
		marginRight: 12,
		marginTop: 10,
		paddingHorizontal: 4,
	}),
	subheaderLineRow: new Style({
		alignItems: 'center',
		flexDirection: 'row',
		justifyContent: 'space-between',
		width: '100%',
	}),
	subheaderLineRowTwo: new Style({
		alignItems: 'center',
		flexDirection: 'row',
		justifyContent: 'space-between',
		marginTop: 3,
		width: '100%',
	}),
	subheaderLines: new Style({
		flexDirection: 'column',
		marginTop: 8,
		width: '100%',
	}),
	subheaderLineTwoLeftText: new Style<Label>({
		...theme.text.sub,
		marginLeft: 12,
		marginTop: 2,
		paddingHorizontal: 4,
	}),
	subheaderLineTwoRightText: new Style<Label>({
		...theme.text.sub,
		marginRight: 12,
		marginTop: 2,
		paddingHorizontal: 4,
	}),
};
