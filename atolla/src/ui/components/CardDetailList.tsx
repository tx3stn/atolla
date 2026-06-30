import { Component } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import { createReusableCallback } from 'valdi_core/src/utils/Callback';
import type { Layout, View } from 'valdi_tsx/src/NativeTemplateElements';
import type { CardDetailItem } from '../../models/App';
import { CardDetail } from './CardDetail';

export interface CardDetailListViewModel {
	accessibilityId: string;
	cards: Array<CardDetailItem>;
	onCardLongPress?: (card: { id: string; kind: 'album' | 'artist' | 'playlist' }) => void;
	onCardTap: (card: { id: string; kind: 'album' | 'artist' | 'playlist' }) => void;
}

export class CardDetailList extends Component<CardDetailListViewModel> {
	onRender() {
		const { accessibilityId, cards, onCardLongPress, onCardTap } = this.viewModel;

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
