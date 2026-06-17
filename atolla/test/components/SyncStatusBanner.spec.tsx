import 'jasmine/src/jasmine';
import { SyncStatusBanner } from 'atolla/src/ui/components/SyncStatusBanner';
import { componentGetElements } from 'foundation/test/util/componentGetElements';
import { elementTypeFind } from 'foundation/test/util/elementTypeFind';
import { IRenderedElementViewClass } from 'valdi_test/test/IRenderedElementViewClass';
import { createComponent, valdiIt } from 'valdi_test/test/JSXTestUtils';
import { touchEvent } from '../util/testEvents';

describe('SyncStatusBanner', () => {
	valdiIt('shows a syncing message with a spinner', async () => {
		const instrumented = createComponent(SyncStatusBanner, {
			completed: 0,
			status: 'syncing',
			total: 3,
		});
		const component = instrumented.getComponent();

		const labels = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.Label,
		);
		const values = labels.map((label) => label.getAttribute('value'));
		expect(values).toContain('syncing 3 changes…');

		const images = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.Image,
		);
		expect(images.length).toBe(1);
	});

	valdiIt('shows a confirmation when fully synced', async () => {
		const instrumented = createComponent(SyncStatusBanner, {
			completed: 3,
			status: 'done',
			total: 3,
		});
		const component = instrumented.getComponent();

		const labels = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.Label,
		);
		const values = labels.map((label) => label.getAttribute('value'));
		expect(values).toContain('synced');
	});

	valdiIt('shows the completed ratio and is tappable on partial sync', async () => {
		let tapped = false;
		const instrumented = createComponent(SyncStatusBanner, {
			completed: 2,
			onTap: () => {
				tapped = true;
			},
			status: 'partial',
			total: 3,
		});
		const component = instrumented.getComponent();

		const labels = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.Label,
		);
		const values = labels.map((label) => label.getAttribute('value'));
		expect(values).toContain('2 of 3 synced');

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const banner = views.find(
			(view) => view.getAttribute('accessibilityLabel') === 'sync-status-banner',
		);
		banner?.getAttribute('onTap')?.(touchEvent);

		expect(tapped).toBe(true);
	});
});
