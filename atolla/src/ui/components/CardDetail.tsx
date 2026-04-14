// @ts-nocheck

import { Component } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import type { ImageView, Label } from 'valdi_tsx/src/NativeTemplateElements';
import { theme, withAlpha } from '../../theme';
import { CachedImage } from './CachedImage';

export interface CardDetailViewModel {
	accessibilityLabel: string;
	artworkKey: string;
	backgroundColor?: string;
	lineOne: string;
	lineThree: string;
	lineTwo: string;
	mutedOnSurfaceColor?: string;
	onSurfaceColor?: string;
	onTap?: () => void;
	testID?: string;
}

export class CardDetail extends Component<CardDetailViewModel> {
	onRender() {
		const {
			accessibilityLabel,
			artworkKey,
			backgroundColor,
			lineOne,
			lineThree,
			lineTwo,
			mutedOnSurfaceColor,
			onTap,
			onSurfaceColor,
			testID,
		} = this.viewModel;

		<view
			accessibilityLabel={accessibilityLabel}
			contentDescription={accessibilityLabel}
			onTap={onTap}
			style={createRowStyle(backgroundColor)}
			testID={testID}
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
					<label style={styles.artworkFallbackLabel} value='ALBUM' />
				)}
			</view>
			<layout style={styles.textColumn}>
				<layout style={styles.textTop}>
					<label style={createLineOneStyle(onSurfaceColor)} value={lineOne} />
					<label numberOfLines={2} style={createLineTwoStyle(onSurfaceColor)} value={lineTwo} />
				</layout>
				<label style={createLineThreeStyle(mutedOnSurfaceColor)} value={lineThree} />
			</layout>
		</view>;
	}
}

const rowBase = {
	alignItems: 'center',
	backgroundColor: theme.colors.bgAccent,
	borderRadius: theme.borderRadius,
	flexDirection: 'row',
	minHeight: 75,
	paddingRight: 12,
	width: '100%',
};

const artworkTileBase = {
	alignItems: 'center',
	aspectRatio: 1,
	borderRadius: theme.borderRadius,
	flexShrink: 0,
	justifyContent: 'center',
	marginRight: 14,
	overflow: 'hidden',
	width: 20,
};

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
	artworkTile: new Style({
		...artworkTileBase,
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
	row: new Style(rowBase),
	textColumn: new Style({
		flexGrow: 1,
		flexShrink: 1,
		height: '100%',
		justifyContent: 'space-between',
		paddingBottom: 10,
		paddingTop: 5,
	}),
	textTop: new Style({
		width: '100%',
	}),
};

const rowStyleByBackgroundColor = new Map<string, Style>();
const lineOneStyleByColor = new Map<string, Style<Label>>();
const lineTwoStyleByColor = new Map<string, Style<Label>>();
const lineThreeStyleByColor = new Map<string, Style<Label>>();

function createRowStyle(backgroundColor?: string): Style {
	if (!backgroundColor) {
		return styles.row;
	}

	const cached = rowStyleByBackgroundColor.get(backgroundColor);
	if (cached) {
		return cached;
	}

	const created = new Style({
		...rowBase,
		backgroundColor: withAlpha(backgroundColor, 0.6),
	});
	rowStyleByBackgroundColor.set(backgroundColor, created);
	return created;
}

function createLineOneStyle(onSurfaceColor?: string): Style<Label> {
	if (!onSurfaceColor) {
		return styles.lineOne;
	}

	const cached = lineOneStyleByColor.get(onSurfaceColor);
	if (cached) {
		return cached;
	}

	const created = new Style<Label>({
		...theme.text.mainBold,
		color: onSurfaceColor,
	});
	lineOneStyleByColor.set(onSurfaceColor, created);
	return created;
}

function createLineTwoStyle(onSurfaceColor?: string): Style<Label> {
	if (!onSurfaceColor) {
		return styles.lineTwo;
	}

	const cached = lineTwoStyleByColor.get(onSurfaceColor);
	if (cached) {
		return cached;
	}

	const created = new Style<Label>({
		...theme.text.main,
		color: onSurfaceColor,
		marginTop: 2,
	});
	lineTwoStyleByColor.set(onSurfaceColor, created);
	return created;
}

function createLineThreeStyle(mutedOnSurfaceColor?: string): Style<Label> {
	if (!mutedOnSurfaceColor) {
		return styles.lineThree;
	}

	const cached = lineThreeStyleByColor.get(mutedOnSurfaceColor);
	if (cached) {
		return cached;
	}

	const created = new Style<Label>({
		...theme.text.sub,
		color: mutedOnSurfaceColor,
	});
	lineThreeStyleByColor.set(mutedOnSurfaceColor, created);
	return created;
}
