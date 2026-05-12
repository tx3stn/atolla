import { Component } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import { createReusableCallback } from 'valdi_core/src/utils/Callback';
import type { Layout, View } from 'valdi_tsx/src/NativeTemplateElements';
import { CardDetail } from './CardDetail';

export interface CardDetailItem {
	artworkKey: string;
	id: string;
	kind: 'album' | 'artist' | 'playlist';
	lineOne: string;
	lineThree: string;
	lineTwo: string;
}

export interface CardDetailListViewModel {
	accessibilityId: string;
	cards: Array<CardDetailItem>;
	onCardTap: (card: { id: string; kind: 'album' | 'artist' | 'playlist' }) => void;
}

export class CardDetailList extends Component<CardDetailListViewModel> {
	onRender() {
		const { accessibilityId, cards, onCardTap } = this.viewModel;

		<layout accessibilityLabel={accessibilityId} style={styles.list}>
			{cards.map((entry, index) => {
				return (
					<view
						key={entry.id}
						style={index === cards.length - 1 ? styles.rowWrapLast : styles.rowWrap}
					>
						<CardDetail
							accessibilityId={`card-detail-${entry.id}`}
							artworkKey={entry.artworkKey}
							lineOne={entry.lineOne}
							lineThree={entry.lineThree}
							lineTwo={entry.lineTwo}
							onTap={createReusableCallback(() => {
								onCardTap({ id: entry.id, kind: entry.kind });
							})}
							testID={`card-detail-${entry.id}`}
						/>
					</view>
				);
			})}
		</layout>;
	}
}

const styles = {
	list: new Style<Layout>({
		width: '100%',
	}),
	rowWrap: new Style<View>({
		marginBottom: 12,
		width: '100%',
	}),
	rowWrapLast: new Style<View>({
		width: '100%',
	}),
};
