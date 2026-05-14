import { Component } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { ImageView, Label, Layout, View } from 'valdi_tsx/src/NativeTemplateElements';
import Strings from '../../Strings';
import { theme } from '../../theme';
import { CachedImage } from './CachedImage';

export interface CardDetailViewModel {
	accessibilityId: string;
	artworkKey: string;
	lineOne: string;
	lineThree: string;
	lineTwo: string;
	onLongPress?: () => void;
	onTap?: () => void;
	testID?: string;
}

export class CardDetail extends Component<CardDetailViewModel> {
	onRender() {
		const { accessibilityId, artworkKey, lineOne, lineThree, lineTwo, onLongPress, onTap } =
			this.viewModel;

		<view
			accessibilityId={accessibilityId}
			accessibilityLabel={accessibilityId}
			onLongPress={onLongPress}
			onTap={onTap}
			style={styles.row}
		>
			<view style={styles.artworkTile}>
				{artworkKey ? (
					<CachedImage
						category='album_art'
						objectFit='cover'
						style={styles.artworkImage}
						url={artworkKey}
					/>
				) : (
					<label style={styles.artworkFallbackLabel} value={Strings.albumFallbackLabel()} />
				)}
			</view>
			<layout style={styles.textColumn}>
				<layout style={styles.textTop}>
					<label style={styles.lineOne} value={lineOne} />
					<label numberOfLines={2} style={styles.lineTwo} value={lineTwo} />
				</layout>
				<label style={styles.lineThree} value={lineThree} />
			</layout>
		</view>;
	}
}

const styles = {
	artworkFallbackLabel: new Style<Label>({
		...theme.text.main,
		textAlign: 'center',
	}),
	artworkImage: new Style<ImageView>({
		borderRadius: theme.borderRadius,
		flexShrink: 0,
		height: '100%',
		width: '100%',
	}),
	artworkTile: new Style<View>({
		alignItems: 'center',
		aspectRatio: 1,
		borderRadius: theme.borderRadius,
		flexShrink: 0,
		justifyContent: 'center',
		marginRight: 14,
		slowClipping: true,
		width: '25%',
	}),
	lineOne: new Style<Label>({
		...theme.text.mainBold,
	}),
	lineThree: new Style<Label>({
		...theme.text.sub,
	}),
	lineTwo: new Style<Label>({
		...theme.text.main,
		marginTop: 2,
	}),
	row: new Style<View>({
		alignItems: 'center',
		backgroundColor: theme.colors.bgRaised,
		borderRadius: theme.borderRadius,
		flexDirection: 'row',
		minHeight: 75,
		paddingRight: 12,
		width: '100%',
	}),
	textColumn: new Style<Layout>({
		flexGrow: 1,
		flexShrink: 1,
		height: '100%',
		justifyContent: 'space-between',
		paddingBottom: 10,
		paddingTop: 5,
	}),
	textTop: new Style<Layout>({
		width: '100%',
	}),
};
