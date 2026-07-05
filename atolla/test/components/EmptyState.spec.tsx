import 'jasmine/src/jasmine';
import { EmptyState } from 'atolla/src/ui/components/EmptyState';
import { componentGetElements } from 'foundation/test/util/componentGetElements';
import { elementTypeFind } from 'foundation/test/util/elementTypeFind';
import { IRenderedElementViewClass } from 'valdi_test/test/IRenderedElementViewClass';
import { valdiIt } from 'valdi_test/test/JSXTestUtils';

describe('EmptyState', () => {
	valdiIt(
		'shows the message when offline with no items and nothing more to load',
		async (driver) => {
			const component = driver.renderComponent(
				EmptyState,
				{ hasMore: false, isOfflineMode: true, itemCount: 0, message: 'nothing downloaded' },
				undefined,
			);

			const labels = elementTypeFind(
				componentGetElements(component),
				IRenderedElementViewClass.Label,
			);
			const values = labels.map((label) => label.getAttribute('value'));
			expect(values).toContain('nothing downloaded');
		},
	);

	valdiIt('hides the message when online', async (driver) => {
		const component = driver.renderComponent(
			EmptyState,
			{ hasMore: false, isOfflineMode: false, itemCount: 0, message: 'nothing downloaded' },
			undefined,
		);

		const labels = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.Label,
		);
		const values = labels.map((label) => label.getAttribute('value'));
		expect(values).not.toContain('nothing downloaded');
	});

	valdiIt('hides the message when there are items', async (driver) => {
		const component = driver.renderComponent(
			EmptyState,
			{ hasMore: false, isOfflineMode: true, itemCount: 3, message: 'nothing downloaded' },
			undefined,
		);

		const labels = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.Label,
		);
		const values = labels.map((label) => label.getAttribute('value'));
		expect(values).not.toContain('nothing downloaded');
	});

	valdiIt('hides the message while there are more pages to load', async (driver) => {
		const component = driver.renderComponent(
			EmptyState,
			{ hasMore: true, isOfflineMode: true, itemCount: 0, message: 'nothing downloaded' },
			undefined,
		);

		const labels = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.Label,
		);
		const values = labels.map((label) => label.getAttribute('value'));
		expect(values).not.toContain('nothing downloaded');
	});
});
