// @ts-nocheck
import 'jasmine/src/jasmine';
import { Spinner } from 'atolla/src/ui/components/Spinner';
import { componentGetElements } from 'foundation/test/util/componentGetElements';
import { elementTypeFind } from 'foundation/test/util/elementTypeFind';
import { IRenderedElementViewClass } from 'valdi_test/test/IRenderedElementViewClass';
import { createComponent, valdiIt } from 'valdi_test/test/JSXTestUtils';

describe('Spinner', () => {
	valdiIt('renders default accessibility label', () => {
		const instrumented = createComponent(Spinner, {});
		const component = instrumented.getComponent();
		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const root = views.find((view) => view.getAttribute('accessibilityLabel') === 'spinner');
		expect(root).toBeTruthy();
	});

	valdiIt('renders provided label text', () => {
		const instrumented = createComponent(Spinner, { label: 'Searching library...' });
		const component = instrumented.getComponent();
		const labels = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.Label,
		);
		const values = labels.map((label) => label.getAttribute('value'));

		expect(values).toContain('Searching library...');
	});

	valdiIt('renders one of the spinner frames', () => {
		const instrumented = createComponent(Spinner, {});
		const component = instrumented.getComponent();
		const labels = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.Label,
		);
		const glyph = labels[0]?.getAttribute('value');

		expect(['|', '/', '-', '\\']).toContain(glyph);
	});
});
