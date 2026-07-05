import 'jasmine/src/jasmine';
import { CardGrid } from 'atolla/src/ui/components/CardGrid';
import { componentGetElements } from 'foundation/test/util/componentGetElements';
import { elementTypeFind } from 'foundation/test/util/elementTypeFind';
import { IRenderedElementViewClass } from 'valdi_test/test/IRenderedElementViewClass';
import { valdiIt } from 'valdi_test/test/JSXTestUtils';
import { layoutFrame, touchEvent, touchEventWith } from '../util/testEvents';

const makeCard = (id: string, primaryText = 'Album', secondaryText = '2024') => ({
	artworkKey: `key-${id}`,
	id,
	kind: 'album' as const,
	primaryText,
	secondaryText,
});

describe('CardGrid', () => {
	valdiIt('renders a tappable tile for each card', async (driver) => {
		const cards = [makeCard('1'), makeCard('2'), makeCard('3')];
		const viewModel = {
			accessibilityId: 'grid',
			cards,
			columnCount: 3,
			onCardTap: () => {},
			resolveArtworkSource: () => null,
		};
		const component = driver.renderComponent(CardGrid, viewModel, undefined);

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const tiles = views.filter((v) => v.getAttribute('accessibilityLabel')?.startsWith('card-'));
		expect(tiles.length).toBe(3);
	});

	valdiIt('renders primary and secondary text labels for each card', async (driver) => {
		const cards = [makeCard('1', 'My Album', '2023')];
		const viewModel = {
			accessibilityId: 'grid',
			cards,
			columnCount: 3,
			onCardTap: () => {},
			resolveArtworkSource: () => null,
		};
		const component = driver.renderComponent(CardGrid, viewModel, undefined);

		const labels = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.Label,
		);
		const values = labels.map((l) => l.getAttribute('value'));
		expect(values).toContain('My Album');
		expect(values).toContain('2023');
	});

	valdiIt('calls onCardTap with id and kind when a card is tapped', async (driver) => {
		const cards = [makeCard('album-42', 'Tap Target', '2020')];
		const captured: { tapped: { id: string; kind: string } | null } = { tapped: null };
		const viewModel = {
			accessibilityId: 'grid',
			cards,
			columnCount: 3,
			onCardTap: (card: { id: string; kind: string }) => {
				captured.tapped = card;
			},
			resolveArtworkSource: () => null,
		};
		const component = driver.renderComponent(CardGrid, viewModel, undefined);

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const tile = views.find((v) => v.getAttribute('accessibilityLabel') === 'card-album-42');
		tile?.getAttribute('onTap')?.(touchEvent);

		expect(captured.tapped).not.toBeNull();
		expect(captured.tapped?.id).toBe('album-42');
		expect(captured.tapped?.kind).toBe('album');
	});

	valdiIt('calls onCardLongPress after hold and suppresses tap', async (driver) => {
		jasmine.clock().install();
		try {
			const cards = [makeCard('album-42', 'Long Press Target', '2020')];
			let tapped = false;
			const captured: { longPressed: { id: string; kind: string } | null } = { longPressed: null };
			const viewModel = {
				accessibilityId: 'grid',
				cards,
				columnCount: 3,
				onCardLongPress: (card: {
					id: string;
					kind: 'album' | 'artist' | 'genre' | 'playlist';
				}) => {
					captured.longPressed = card;
				},
				onCardTap: () => {
					tapped = true;
				},
				resolveArtworkSource: () => null,
			};
			const component = driver.renderComponent(CardGrid, viewModel, undefined);

			const views = elementTypeFind(
				componentGetElements(component),
				IRenderedElementViewClass.View,
			);
			const tile = views.find((v) => v.getAttribute('accessibilityLabel') === 'card-album-42');
			tile?.getAttribute('onTouch')?.(touchEventWith({ state: 0 }));
			jasmine.clock().tick(500);
			tile?.getAttribute('onTap')?.(touchEvent);

			expect(captured.longPressed).not.toBeNull();
			expect(captured.longPressed?.id).toBe('album-42');
			expect(captured.longPressed?.kind).toBe('album');
			expect(tapped).toBe(false);
		} finally {
			jasmine.clock().uninstall();
		}
	});

	valdiIt('shows fallback label when no artwork source is resolved', async (driver) => {
		const cards = [makeCard('1', 'Title', '2021')];
		const viewModel = {
			accessibilityId: 'grid',
			cards,
			columnCount: 3,
			onCardTap: () => {},
			resolveArtworkSource: () => null,
		};
		const component = driver.renderComponent(CardGrid, viewModel, undefined);

		const labels = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.Label,
		);
		const values = labels.map((l) => l.getAttribute('value'));
		expect(values).toContain('ALBUM');
	});

	valdiIt('renders an image when artwork source is provided', async (driver) => {
		const cards = [makeCard('1')];
		const viewModel = {
			accessibilityId: 'grid',
			cards,
			columnCount: 3,
			onCardTap: () => {},
			resolveArtworkSource: () => 'https://example.com/art.jpg',
		};
		const component = driver.renderComponent(CardGrid, viewModel, undefined);

		const images = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.Image,
		);
		expect(images.length).toBe(1);
		expect(images[0].getAttribute('src')).toContain('atolla-cache://image?c=album_art_thumb&u=');
	});

	valdiIt('auto-loads more when prefetch trigger is laid out', async (driver) => {
		const cards = Array.from({ length: 30 }, (_, index) => makeCard(String(index + 1)));
		let loadMoreCalls = 0;
		const viewModel = {
			accessibilityId: 'grid',
			cards,
			columnCount: 3,
			onCardTap: () => {},
			onLoadMore: () => {
				loadMoreCalls += 1;
			},
			resolveArtworkSource: () => null,
		};
		const component = driver.renderComponent(CardGrid, viewModel, undefined);

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const trigger = views.find(
			(view) => view.getAttribute('accessibilityLabel') === 'grid-prefetch-trigger',
		);
		expect(trigger).toBeDefined();

		trigger?.getAttribute('onLayout')?.(layoutFrame);
		trigger?.getAttribute('onLayout')?.(layoutFrame);

		expect(loadMoreCalls).toBe(1);
	});

	valdiIt('shows loading spinner label while loading next page', async (driver) => {
		const cards = Array.from({ length: 30 }, (_, index) => makeCard(String(index + 1)));
		const viewModel = {
			accessibilityId: 'grid',
			cards,
			columnCount: 3,
			isLoadingMore: true,
			onCardTap: () => {},
			onLoadMore: () => {},
			resolveArtworkSource: () => null,
		};
		const component = driver.renderComponent(CardGrid, viewModel, undefined);

		const labels = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.Label,
		);
		const values = labels.map((label) => label.getAttribute('value'));
		expect(values).toContain('loading...');
	});

	valdiIt('places prefetch trigger after first row when using 4 columns', async (driver) => {
		const cards = Array.from({ length: 8 }, (_, index) => makeCard(String(index + 1)));
		const viewModel = {
			accessibilityId: 'grid',
			cards,
			columnCount: 4,
			onCardTap: () => {},
			onLoadMore: () => {},
			resolveArtworkSource: () => null,
		};
		const component = driver.renderComponent(CardGrid, viewModel, undefined);

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const triggerIndex = views.findIndex(
			(view) => view.getAttribute('accessibilityLabel') === 'grid-prefetch-trigger',
		);
		const card4Index = views.findIndex(
			(view) => view.getAttribute('accessibilityLabel') === 'card-4',
		);
		const card5Index = views.findIndex(
			(view) => view.getAttribute('accessibilityLabel') === 'card-5',
		);

		expect(triggerIndex).toBeGreaterThan(card4Index);
		expect(triggerIndex).toBeLessThan(card5Index);
	});
});
