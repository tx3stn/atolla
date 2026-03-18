// @ts-nocheck
import { Component } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import { createReusableCallback } from 'valdi_core/src/utils/Callback';
import type { ImageView, Label } from 'valdi_tsx/src/NativeTemplateElements';
import { theme } from '../../theme';

export interface Card {
	artworkKey: string;
	id: string;
	kind: 'album' | 'artist' | 'playlist';
	primaryText: string;
	secondaryText: string;
}

export interface CardGridViewModel {
	accessibilityLabel: string;
	cards: Array<Card>;
	onCardTap: (card: { id: string; kind: 'album' | 'artist' | 'playlist' }) => void;
	resolveArtworkSource: (artworkKey: string) => string | null;
}

export class CardGrid extends Component<CardGridViewModel> {
	onRender() {
		const { accessibilityLabel, cards, onCardTap, resolveArtworkSource } = this.viewModel;

		const rows: Array<Array<Card>> = [];
		for (let i = 0; i < cards.length; i += 3) {
			rows.push(cards.slice(i, i + 3));
		}

		<layout
			accessibilityLabel={accessibilityLabel}
			contentDescription={accessibilityLabel}
			style={styles.grid}
		>
			{rows.map((row, rowIndex) => (
				<layout
					key={`row-${rowIndex}`}
					style={row.length === 3 ? styles.cardGridRowFull : styles.cardGridRowPartial}
				>
					{row.map((entry) => {
						const artworkSource = resolveArtworkSource(entry.artworkKey);
						return (
							<layout key={entry.id} style={styles.browseCard}>
								<view
									accessibilityLabel={`card-${entry.id}`}
									contentDescription={`card-${entry.id}`}
									onTap={createReusableCallback(() => {
										onCardTap({ id: entry.id, kind: entry.kind });
									})}
									style={styles.artworkTile}
									testID={`card-${entry.id}`}
								>
									{artworkSource ? (
										<image objectFit='cover' src={artworkSource} style={styles.artworkImage} />
									) : (
										<label style={styles.artworkFallbackLabel} value={entry.kind.toUpperCase()} />
									)}
								</view>
								<label style={styles.cardTitle} value={entry.primaryText} />
								<label style={styles.cardSubtitle} value={entry.secondaryText} />
							</layout>
						);
					})}
				</layout>
			))}
		</layout>;
	}
}

const styles = {
	artworkFallbackLabel: new Style<Label>({
		...theme.text.main,
		textAlign: 'center',
	}),
	artworkImage: new Style<ImageView>({
		borderRadius: theme.borderRadius,
		height: '100%',
		width: '100%',
	}),
	artworkTile: new Style({
		alignItems: 'center',
		aspectRatio: 1,
		backgroundColor: theme.colors.bgAccent,
		borderRadius: theme.borderRadius,
		justifyContent: 'center',
		overflow: 'hidden',
		width: '100%',
	}),
	browseCard: new Style({
		padding: 2,
		paddingTop: 12,
		rowGap: 4,
		width: '33%',
	}),
	cardGridRowFull: new Style({
		flexDirection: 'row',
		flexShrink: 0,
		justifyContent: 'space-between',
		marginBottom: 4,
		width: '100%',
	}),
	cardGridRowPartial: new Style({
		columnGap: '1%',
		flexDirection: 'row',
		flexShrink: 0,
		justifyContent: 'flex-start',
		marginBottom: 4,
		width: '100%',
	}),
	cardSubtitle: new Style<Label>({
		...theme.text.sub,
		marginLeft: 6,
		marginTop: 1,
	}),
	cardTitle: new Style<Label>({
		...theme.text.main,
		marginLeft: 6,
		marginTop: 7,
	}),
	grid: new Style({
		width: '100%',
	}),
};
