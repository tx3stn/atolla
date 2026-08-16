import 'jasmine/src/jasmine';
import type { CardDetailItem } from 'atolla_app/src/models/App';
import { CardDetailList } from 'atolla_app/src/ui/components/CardDetailList';
import { componentGetElements } from 'foundation/test/util/componentGetElements';
import { elementTypeFind } from 'foundation/test/util/elementTypeFind';
import { IRenderedElementViewClass } from 'valdi_test/test/IRenderedElementViewClass';
import { valdiIt } from 'valdi_test/test/JSXTestUtils';

function makeCard(id: string): CardDetailItem {
	return {
		artworkKey: `art-${id}`,
		id,
		kind: 'album',
		lineOne: `line one ${id}`,
		lineThree: `line three ${id}`,
		lineTwo: `line two ${id}`,
	};
}

function renderedCardIds(component: Parameters<typeof componentGetElements>[0]): Array<string> {
	return elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View)
		.map((view) => view.getAttribute('accessibilityLabel'))
		.filter(
			(label): label is string => typeof label === 'string' && label.startsWith('card-detail-'),
		);
}

describe('CardDetailList', () => {
	valdiIt('renders every card in a single column', async (driver) => {
		const cards = Array.from({ length: 4 }, (_, index) => makeCard(String(index + 1)));
		const component = driver.renderComponent(
			CardDetailList,
			{ accessibilityId: 'list', cards, columnCount: 1, onCardTap: () => {} },
			undefined,
		);

		expect(renderedCardIds(component)).toEqual([
			'card-detail-1',
			'card-detail-2',
			'card-detail-3',
			'card-detail-4',
		]);
	});

	// chunking into rows must not drop, duplicate or reorder cards
	valdiIt('renders every card in the same order across two columns', async (driver) => {
		const cards = Array.from({ length: 4 }, (_, index) => makeCard(String(index + 1)));
		const component = driver.renderComponent(
			CardDetailList,
			{ accessibilityId: 'list', cards, columnCount: 2, onCardTap: () => {} },
			undefined,
		);

		expect(renderedCardIds(component)).toEqual([
			'card-detail-1',
			'card-detail-2',
			'card-detail-3',
			'card-detail-4',
		]);
	});

	// the trailing row is partial, which is where an off-by-one in the chunking would show up
	valdiIt('keeps an odd final card when the row is not full', async (driver) => {
		const cards = Array.from({ length: 5 }, (_, index) => makeCard(String(index + 1)));
		const component = driver.renderComponent(
			CardDetailList,
			{ accessibilityId: 'list', cards, columnCount: 2, onCardTap: () => {} },
			undefined,
		);

		expect(renderedCardIds(component)).toContain('card-detail-5');
		expect(renderedCardIds(component).length).toBe(5);
	});

	valdiIt('falls back to a single column when no column count is given', async (driver) => {
		const cards = Array.from({ length: 3 }, (_, index) => makeCard(String(index + 1)));
		const component = driver.renderComponent(
			CardDetailList,
			{ accessibilityId: 'list', cards, onCardTap: () => {} },
			undefined,
		);

		expect(renderedCardIds(component).length).toBe(3);
	});
});
