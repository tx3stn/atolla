// @ts-nocheck
import 'jasmine/src/jasmine';
import { SearchView } from 'atolla/src/ui/views/SearchView';
import { componentGetElements } from 'foundation/test/util/componentGetElements';
import { elementTypeFind } from 'foundation/test/util/elementTypeFind';
import { IRenderedElementViewClass } from 'valdi_test/test/IRenderedElementViewClass';
import { createComponent, valdiIt } from 'valdi_test/test/JSXTestUtils';

describe('SearchView', () => {
	valdiIt('starts with an empty query', () => {
		const instrumented = createComponent(SearchView, {});
		const component = instrumented.getComponent();

		expect(component.state.query).toBe('');
	});

	valdiIt('updates query state when textfield changes', () => {
		const instrumented = createComponent(SearchView, {});
		const component = instrumented.getComponent();
		const textField = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.TextField,
		)[0];

		textField.getAttribute('onChange')?.('dream pop');

		expect(component.state.query).toBe('dream pop');
	});

	valdiIt('renders search bar with accessibility labels', () => {
		const instrumented = createComponent(SearchView, {});
		const component = instrumented.getComponent();
		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const searchBar = views.find(
			(view) => view.getAttribute('accessibilityLabel') === 'search-bar',
		);

		expect(searchBar).toBeTruthy();
		expect(searchBar?.getAttribute('contentDescription')).toBe('search-bar');
	});
});
