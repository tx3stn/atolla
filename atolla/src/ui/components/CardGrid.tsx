// @ts-nocheck
import { Component } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import { createReusableCallback } from 'valdi_core/src/utils/Callback';
import type { ImageView, Label } from 'valdi_tsx/src/NativeTemplateElements';
import type { ImageCache, ImageCategory } from '../../services/ImageCache';
import { theme } from '../../theme';
import { CachedImage } from './CachedImage';

export interface Card {
	artworkKey: string;
	id: string;
	kind: 'album' | 'artist' | 'playlist';
	primaryText: string;
	secondaryText: string;
}

export interface CardGridViewModel {
	accessibilityLabel: string;
	cacheVersion?: number;
	cards: Array<Card>;
	imageCache?: ImageCache;
	isLoadingMore?: boolean;
	onCardLongPress?: (card: { id: string; kind: 'album' | 'artist' | 'playlist' }) => void;
	onCardTap: (card: { id: string; kind: 'album' | 'artist' | 'playlist' }) => void;
	onLoadMore?: () => void;
	onRetryLoadMore?: () => void;
	resolveArtworkSource?: (artworkKey: string) => string | null;
}

const TouchEventState = { Changed: 1, Ended: 2, Started: 0 } as const;
const CARD_LONG_PRESS_DELAY_MS = 500;

export class CardGrid extends Component<CardGridViewModel> {
	private longPressTimeout: ReturnType<typeof setTimeout> | null = null;
	private suppressNextTap = false;

	onDestroy(): void {
		this.cancelCardLongPress();
	}

	onRender() {
		const {
			accessibilityLabel,
			cacheVersion,
			cards,
			imageCache,
			isLoadingMore,
			onCardLongPress,
			onCardTap,
			onLoadMore,
			onRetryLoadMore,
			resolveArtworkSource,
		} = this.viewModel;

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
						const artworkKey = resolveArtworkSource
							? resolveArtworkSource(entry.artworkKey)
							: entry.artworkKey;
						const category = cardKindToCategory(entry.kind);
						return (
							<layout key={entry.id} style={styles.browseCard}>
								<view
									accessibilityLabel={`card-${entry.id}`}
									contentDescription={`card-${entry.id}`}
									onTap={createReusableCallback(() => {
										if (this.suppressNextTap) {
											this.suppressNextTap = false;
											return;
										}
										onCardTap({ id: entry.id, kind: entry.kind });
									})}
									onTouch={
										onCardLongPress
											? createReusableCallback((event) => {
													this.handleCardTouch(event, entry.id, entry.kind);
												})
											: undefined
									}
									style={styles.artworkTile}
									testID={`card-${entry.id}`}
								>
									{artworkKey ? (
										<CachedImage
											cacheVersion={cacheVersion}
											category={category}
											imageCache={imageCache}
											objectFit='cover'
											style={styles.artworkImage}
											url={artworkKey}
										/>
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
			{isLoadingMore ? (
				<label style={styles.loadMoreLabel} value='Loading more...' />
			) : onRetryLoadMore ? (
				<view
					accessibilityLabel='grid-load-more-retry'
					contentDescription='grid-load-more-retry'
					onTap={createReusableCallback(() => {
						onRetryLoadMore();
					})}
					style={styles.loadMoreRetryContainer}
					testID='grid-load-more-retry'
				>
					<label style={styles.loadMoreRetryLabel} value='Failed to load more. Tap to retry.' />
				</view>
			) : onLoadMore ? (
				<view
					accessibilityLabel='grid-load-more'
					contentDescription='grid-load-more'
					onTap={createReusableCallback(() => {
						onLoadMore();
					})}
					style={styles.loadMoreRetryContainer}
					testID='grid-load-more'
				>
					<label style={styles.loadMoreRetryLabel} value='Load more' />
				</view>
			) : null}
		</layout>;
	}

	private handleCardTouch(event, cardId: string, kind: Card['kind']): void {
		if (event.state === TouchEventState.Started) {
			this.scheduleCardLongPress(cardId, kind);
			return;
		}

		if (event.state === TouchEventState.Changed) {
			return;
		}

		this.cancelCardLongPress();
	}

	private scheduleCardLongPress(cardId: string, kind: Card['kind']): void {
		if (!this.viewModel.onCardLongPress) {
			return;
		}

		this.cancelCardLongPress();
		this.longPressTimeout = setTimeout(() => {
			this.longPressTimeout = null;
			this.suppressNextTap = true;
			this.viewModel.onCardLongPress?.({ id: cardId, kind });
		}, CARD_LONG_PRESS_DELAY_MS);
	}

	private cancelCardLongPress(): void {
		if (!this.longPressTimeout) {
			return;
		}

		clearTimeout(this.longPressTimeout);
		this.longPressTimeout = null;
	}
}

function cardKindToCategory(kind: Card['kind']): ImageCategory {
	if (kind === 'artist') return 'artist_image';
	if (kind === 'playlist') return 'playlist_image';
	return 'album_art';
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
	loadMoreLabel: new Style<Label>({
		...theme.text.sub,
		marginTop: 12,
		textAlign: 'center',
	}),
	loadMoreRetryContainer: new Style({
		alignItems: 'center',
		marginTop: 12,
		paddingVertical: 8,
	}),
	loadMoreRetryLabel: new Style<Label>({
		...theme.text.main,
		textAlign: 'center',
	}),
};
