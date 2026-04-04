// @ts-nocheck
import 'jasmine/src/jasmine';
import { CardGrid } from 'atolla/src/ui/components/CardGrid';
import { componentGetElements } from 'foundation/test/util/componentGetElements';
import { elementTypeFind } from 'foundation/test/util/elementTypeFind';
import { IRenderedElementViewClass } from 'valdi_test/test/IRenderedElementViewClass';
import { createComponent, valdiIt } from 'valdi_test/test/JSXTestUtils';

const makeCard = (id: string, primaryText = 'Album', secondaryText = '2024') => ({
	artworkKey: `key-${id}`,
	id,
	kind: 'album' as const,
	primaryText,
	secondaryText,
});

describe('CardGrid', () => {
	valdiIt('renders a tappable tile for each card', () => {
		const cards = [makeCard('1'), makeCard('2'), makeCard('3')];
		const instrumented = createComponent(CardGrid, {
			accessibilityLabel: 'grid',
			cards,
			onCardTap: () => {},
			resolveArtworkSource: () => null,
		});
		const component = instrumented.getComponent();

		const tiles = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		expect(tiles.length).toBe(3);
	});

	valdiIt('renders primary and secondary text labels for each card', () => {
		const cards = [makeCard('1', 'My Album', '2023')];
		const instrumented = createComponent(CardGrid, {
			accessibilityLabel: 'grid',
			cards,
			onCardTap: () => {},
			resolveArtworkSource: () => null,
		});
		const component = instrumented.getComponent();

		const labels = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.Label,
		);
		const values = labels.map((l) => l.getAttribute('value'));
		expect(values).toContain('My Album');
		expect(values).toContain('2023');
	});

	valdiIt('calls onCardTap with id and kind when a card is tapped', () => {
		const cards = [makeCard('album-42', 'Tap Target', '2020')];
		let tapped: { id: string; kind: string } | null = null;
		const instrumented = createComponent(CardGrid, {
			accessibilityLabel: 'grid',
			cards,
			onCardTap: (card) => {
				tapped = card;
			},
			resolveArtworkSource: () => null,
		});
		const component = instrumented.getComponent();

		const tiles = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		tiles[0].getAttribute('onTap')?.();

		expect(tapped).not.toBeNull();
		expect(tapped?.id).toBe('album-42');
		expect(tapped?.kind).toBe('album');
	});

	valdiIt('calls onCardLongPress after hold and suppresses tap', () => {
		jasmine.clock().install();
		try {
			const cards = [makeCard('album-42', 'Long Press Target', '2020')];
			let tapped = false;
			let longPressed: { id: string; kind: string } | null = null;
			const instrumented = createComponent(CardGrid, {
				accessibilityLabel: 'grid',
				cards,
				onCardLongPress: (card) => {
					longPressed = card;
				},
				onCardTap: () => {
					tapped = true;
				},
				resolveArtworkSource: () => null,
			});
			const component = instrumented.getComponent();

			const tiles = elementTypeFind(
				componentGetElements(component),
				IRenderedElementViewClass.View,
			);
			tiles[0].getAttribute('onTouch')?.({ state: 0 });
			jasmine.clock().tick(500);
			tiles[0].getAttribute('onTap')?.();

			expect(longPressed).not.toBeNull();
			expect(longPressed?.id).toBe('album-42');
			expect(longPressed?.kind).toBe('album');
			expect(tapped).toBe(false);
		} finally {
			jasmine.clock().uninstall();
		}
	});

	valdiIt('shows fallback label when no artwork source is resolved', () => {
		const cards = [makeCard('1', 'Title', '2021')];
		const instrumented = createComponent(CardGrid, {
			accessibilityLabel: 'grid',
			cards,
			onCardTap: () => {},
			resolveArtworkSource: () => null,
		});
		const component = instrumented.getComponent();

		const labels = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.Label,
		);
		const values = labels.map((l) => l.getAttribute('value'));
		expect(values).toContain('ALBUM');
	});

	valdiIt('renders an image when artwork source is provided', () => {
		const cards = [makeCard('1')];
		const instrumented = createComponent(CardGrid, {
			accessibilityLabel: 'grid',
			cards,
			onCardTap: () => {},
			resolveArtworkSource: () => 'https://example.com/art.jpg',
		});
		const component = instrumented.getComponent();

		const images = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.Image,
		);
		expect(images.length).toBe(1);
		expect(images[0].getAttribute('src')).toContain('atolla-cache://image?c=album_art&u=');
	});
});
