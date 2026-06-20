import 'jasmine/src/jasmine';
import { Modal } from 'atolla/src/ui/components/Modal';
import { elementTypeFind } from 'foundation/test/util/elementTypeFind';
import { IRenderedElementViewClass } from 'valdi_test/test/IRenderedElementViewClass';
import { valdiIt } from 'valdi_test/test/JSXTestUtils';
import { touchEvent } from '../util/testEvents';
import { renderedElements } from './renderedElements';

describe('Modal', () => {
	valdiIt('renders artist logo through cache image source', async (driver) => {
		const viewModel = {
			body: 'Long artist bio',
			logoUrl: 'https://example.com/artist-logo.png',
			onClose: () => {},
			title: 'Artist Name',
		};
		const component = driver.renderComponent(Modal, viewModel, undefined);

		const images = elementTypeFind(renderedElements(component), IRenderedElementViewClass.Image);

		expect(images.length).toBe(1);
		expect(images[0].getAttribute('src')).toContain('atolla-cache://image?c=artist_logo&u=');
	});

	valdiIt('fires confirm and cancel callbacks from the action buttons', async (driver) => {
		const calls: Array<string> = [];
		const viewModel = {
			animationsEnabled: false,
			body: 'Delete this playlist?',
			cancelAccessibilityId: 'modal-cancel',
			confirmAccessibilityId: 'modal-confirm',
			onClose: () => {
				calls.push('close');
			},
			onConfirm: () => {
				calls.push('confirm');
			},
			title: 'Delete',
		};
		const component = driver.renderComponent(Modal, viewModel, undefined);

		const views = elementTypeFind(renderedElements(component), IRenderedElementViewClass.View);
		const confirm = views.find(
			(view) => view.getAttribute('accessibilityLabel') === 'modal-confirm-btn',
		);
		const cancel = views.find(
			(view) => view.getAttribute('accessibilityLabel') === 'modal-cancel-btn',
		);

		confirm?.getAttribute('onTap')?.(touchEvent);
		cancel?.getAttribute('onTap')?.(touchEvent);

		expect(calls).toEqual(['confirm', 'close']);
	});
});
