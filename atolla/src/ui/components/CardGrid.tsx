import { Component } from 'valdi_core/src/Component';
import { Style } from 'valdi_core/src/Style';
import { createReusableCallback } from 'valdi_core/src/utils/Callback';
import type { Asset } from 'valdi_tsx/src/Asset';
import type { DragEvent, TouchEvent } from 'valdi_tsx/src/GestureEvents';
import type { ImageView, Label, Layout } from 'valdi_tsx/src/NativeTemplateElements';
import Strings from '../../Strings';
import type { ImageCategory } from '../../services/ImageCache';
import { theme } from '../../theme';
import { CachedImage } from './CachedImage';
import { TouchEventState } from './TouchEventState';

export interface Card {
	artworkKey: string;
	icon?: string | Asset;
	id: string;
	kind: 'album' | 'artist' | 'genre' | 'playlist';
	primaryText: string;
	secondaryText: string;
}

export interface CardGridViewModel {
	accessibilityLabel: string;
	cacheVersion?: number;
	cards: Array<Card>;
	columnCount?: number;
	infiniteScrollTriggerRatio?: number;
	isLoadingMore?: boolean;
	onCardLongPress?: (card: { id: string; kind: 'album' | 'artist' | 'genre' | 'playlist' }) => void;
	onCardTap: (card: { id: string; kind: 'album' | 'artist' | 'genre' | 'playlist' }) => void;
	onLoadMore?: () => void;
	onRetryLoadMore?: () => void;
	resolveArtworkSource?: (artworkKey: string) => string | null;
}

const CARD_LONG_PRESS_DELAY_MS = 500;

export class CardGrid extends Component<CardGridViewModel> {
	private longPressTimeout: ReturnType<typeof setTimeout> | null = null;
	private triggeredAutoLoadForCardCount: number | null = null;
	private suppressNextTap = false;

	onDestroy(): void {
		this.cancelCardLongPress();
	}

	onRender() {
		const {
			accessibilityLabel,
			cacheVersion,
			cards,
			columnCount: rawColumnCount,
			infiniteScrollTriggerRatio,
			isLoadingMore,
			onCardLongPress,
			onCardTap,
			onLoadMore,
			onRetryLoadMore,
			resolveArtworkSource,
		} = this.viewModel;
		const columnCount = rawColumnCount ?? 2;

		const rows: Array<Array<Card>> = [];
		for (let i = 0; i < cards.length; i += columnCount) {
			rows.push(cards.slice(i, i + columnCount));
		}

		const triggerRowIndex =
			onLoadMore && rows.length > 0
				? Math.min(
						rows.length - 1,
						Math.max(0, Math.floor((rows.length - 1) * (infiniteScrollTriggerRatio ?? 0.7))),
					)
				: -1;

		<layout accessibilityLabel={accessibilityLabel} style={styles.grid}>
			{rows.map((row, rowIndex) => (
				<layout
					key={`row-${rowIndex}`}
					style={row.length === columnCount ? styles.cardGridRowFull : styles.cardGridRowPartial}
				>
					{row.map((entry) => {
						const artworkKey = resolveArtworkSource
							? resolveArtworkSource(entry.artworkKey)
							: entry.artworkKey;
						const category = cardKindToCategory(entry.kind);
						return (
							<layout key={entry.id} style={createBrowseCardStyle(columnCount)}>
								<view
									accessibilityLabel={`card-${entry.id}`}
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
									style={entry.icon ? styles.artworkTileIcon : styles.artworkTile}
								>
									{entry.icon ? (
										<image src={entry.icon} style={styles.artworkIcon} />
									) : artworkKey ? (
										<CachedImage
											cacheVersion={cacheVersion}
											category={category}
											objectFit='cover'
											style={styles.artworkImage}
											url={artworkKey}
										/>
									) : (
										<label style={styles.artworkFallbackLabel} value={entry.kind.toUpperCase()} />
									)}
								</view>
								<label
									numberOfLines={entry.icon ? 2 : 1}
									style={entry.icon ? styles.cardTitleIcon : styles.cardTitle}
									value={entry.primaryText}
								/>
								<label style={styles.cardSubtitle} value={entry.secondaryText} />
							</layout>
						);
					})}
					{rowIndex === triggerRowIndex && (
						<view
							accessibilityLabel='grid-prefetch-trigger'
							onLayout={createReusableCallback(() => {
								this.handleAutoLoadTriggerLayout();
							})}
							style={styles.prefetchTrigger}
						/>
					)}
				</layout>
			))}
			{isLoadingMore ? (
				<label style={styles.loadMoreLabel} value={Strings.loadingMore()} />
			) : onRetryLoadMore ? (
				<view
					accessibilityLabel='grid-load-more-retry'
					onTap={createReusableCallback(() => {
						onRetryLoadMore();
					})}
					style={styles.loadMoreRetryContainer}
				>
					<label style={styles.loadMoreRetryLabel} value={Strings.failedToLoadMore()} />
				</view>
			) : null}
		</layout>;
	}

	private handleAutoLoadTriggerLayout(): void {
		const { cards, onLoadMore } = this.viewModel;
		if (!onLoadMore) {
			return;
		}

		if (this.triggeredAutoLoadForCardCount === cards.length) {
			return;
		}

		this.triggeredAutoLoadForCardCount = cards.length;
		onLoadMore();
	}

	private handleCardTouch(event: TouchEvent, cardId: string, kind: Card['kind']): void {
		if (event.state === TouchEventState.Started) {
			this.scheduleCardLongPress(cardId, kind);
			return;
		}

		if (event.state === TouchEventState.Changed) {
			const drag = event as DragEvent;
			if (Math.abs(drag.deltaX) > 5 || Math.abs(drag.deltaY) > 5) {
				this.cancelCardLongPress();
			}
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
	if (kind === 'artist') return 'artist_image_thumb';
	if (kind === 'playlist') return 'playlist_image_thumb';
	if (kind === 'genre') return 'genre_art';
	return 'album_art_thumb';
}

const styles = {
	artworkFallbackLabel: new Style<Label>({
		...theme.text.main,
		textAlign: 'center',
	}),
	artworkIcon: new Style<ImageView>({
		height: '30%',
		width: '65%',
	}),
	artworkImage: new Style<ImageView>({
		borderRadius: theme.borderRadius,
		height: '100%',
		width: '100%',
	}),
	artworkTile: new Style({
		alignItems: 'center' as const,
		aspectRatio: 1,
		backgroundColor: theme.colors.bgAccent,
		borderRadius: theme.borderRadius,
		justifyContent: 'center' as const,
		slowClipping: true,
		width: '100%',
	}),
	artworkTileIcon: new Style({
		alignItems: 'center' as const,
		aspectRatio: 1,
		backgroundColor: theme.colors.bgRaised,
		borderRadius: theme.borderRadius,
		justifyContent: 'center' as const,
		slowClipping: true,
		width: '100%',
	}),
	browseCardBase: {
		padding: 2,
		paddingTop: 12,
		rowGap: 4,
	},
	cardGridRowFull: new Style<Layout>({
		flexDirection: 'row',
		flexShrink: 0,
		justifyContent: 'space-between',
		marginBottom: 4,
		width: '100%',
	}),
	cardGridRowPartial: new Style({
		columnGap: '1%',
		flexDirection: 'row' as const,
		flexShrink: 0,
		justifyContent: 'flex-start' as const,
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
	cardTitleIcon: new Style<Label>({
		...theme.text.main,
		marginLeft: 6,
		marginRight: 6,
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
	loadMoreRetryContainer: new Style<Layout>({
		alignItems: 'center',
		marginTop: 12,
		paddingBottom: 8,
		paddingTop: 8,
	}),
	loadMoreRetryLabel: new Style<Label>({
		...theme.text.main,
		textAlign: 'center',
	}),
	prefetchTrigger: new Style({
		height: 1,
		width: '100%',
	}),
};

const browseCardStyleByColumnCount: Record<number, Style<Layout>> = {};

function createBrowseCardStyle(columnCount: number): Style<Layout> {
	if (browseCardStyleByColumnCount[columnCount]) {
		return browseCardStyleByColumnCount[columnCount];
	}

	const width = columnCount === 4 ? '24.5%' : columnCount === 3 ? '33%' : `${99 / columnCount}%`;
	const style = new Style({
		...styles.browseCardBase,
		width,
	});
	browseCardStyleByColumnCount[columnCount] = style;
	return style;
}
