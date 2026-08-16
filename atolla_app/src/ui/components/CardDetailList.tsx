import { Component } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import { createReusableCallback } from 'valdi_core/src/utils/Callback';
import type { Layout } from 'valdi_tsx/src/NativeTemplateElements';
import type { CardDetailItem } from '../../models/App';
import { theme } from '../../theme';
import { CardDetail } from './CardDetail';

export interface CardDetailListViewModel {
	accessibilityId: string;
	cards: Array<CardDetailItem>;
	columnCount?: number;
	onCardLongPress?: (card: { id: string; kind: 'album' | 'artist' | 'playlist' }) => void;
	onCardTap: (card: { id: string; kind: 'album' | 'artist' | 'playlist' }) => void;
}

export class CardDetailList extends Component<CardDetailListViewModel> {
	onRender() {
		const { accessibilityId, cards, onCardLongPress, onCardTap } = this.viewModel;
		const columnCount = Math.max(1, this.viewModel.columnCount ?? 1);

		const rows: Array<Array<CardDetailItem>> = [];
		for (let i = 0; i < cards.length; i += columnCount) {
			rows.push(cards.slice(i, i + columnCount));
		}

		<layout accessibilityLabel={accessibilityId} style={styles.list}>
			{rows.map((row, rowIndex) => (
				<layout
					key={`row-${rowIndex}`}
					style={rowIndex === rows.length - 1 ? styles.rowLast : styles.row}
				>
					{row.map((entry) => (
						<layout key={entry.id} style={createColumnStyle(columnCount)}>
							<CardDetail
								accessibilityId={`card-detail-${entry.id}`}
								artworkKey={entry.artworkKey}
								lineOne={entry.lineOne}
								lineThree={entry.lineThree}
								lineTwo={entry.lineTwo}
								onLongPress={
									onCardLongPress
										? createReusableCallback(() => {
												onCardLongPress({ id: entry.id, kind: entry.kind });
											})
										: undefined
								}
								onTap={createReusableCallback(() => {
									onCardTap({ id: entry.id, kind: entry.kind });
								})}
							/>
						</layout>
					))}
				</layout>
			))}
		</layout>;
	}
}

const columnStyleByCount: Record<number, Style<Layout>> = {};

function createColumnStyle(columnCount: number): Style<Layout> {
	const cached = columnStyleByCount[columnCount];
	if (cached) {
		return cached;
	}

	const style = new Style<Layout>({
		width: columnCount === 1 ? '100%' : `${99 / columnCount}%`,
	});
	columnStyleByCount[columnCount] = style;
	return style;
}

const styles = {
	list: new Style<Layout>({
		width: '100%',
	}),
	row: new Style<Layout>({
		flexDirection: 'row',
		justifyContent: 'space-between',
		marginBottom: theme.scale(12),
		width: '100%',
	}),
	rowLast: new Style<Layout>({
		flexDirection: 'row',
		justifyContent: 'space-between',
		width: '100%',
	}),
};
