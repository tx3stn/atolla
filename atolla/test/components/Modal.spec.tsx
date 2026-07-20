import 'jasmine/src/jasmine';
import { Modal } from 'atolla/src/ui/components/Modal';
import { modalStyles } from 'atolla/src/ui/components/ModalBase';
import { elementTypeFind } from 'foundation/test/util/elementTypeFind';
import { IRenderedElementViewClass } from 'valdi_test/test/IRenderedElementViewClass';
import { valdiIt } from 'valdi_test/test/JSXTestUtils';
import { touchEvent } from '../util/testEvents';

describe('Modal', () => {
	valdiIt('renders artist logo through cache image source', async (driver) => {
		const viewModel = {
			body: 'Long artist bio',
			logoUrl: 'https://example.com/artist-logo.png',
			onClose: () => {},
			title: 'Artist Name',
		};
		const component = driver.renderComponent(Modal, viewModel, undefined);

		const images = elementTypeFind(
			component.renderer.getComponentRootElements(component, true),
			IRenderedElementViewClass.Image,
		);

		expect(images.length).toBe(1);
		expect(images[0].getAttribute('src')).toContain('atolla-cache://image?c=artist_logo&u=');
	});

	// every <view> is a native view; a container with no paint or touch props only needs a layout
	// node. the action row is five nested containers deep, so this is the densest cluster in the app
	valdiIt('allocates no native view for its structural containers', async (driver) => {
		const viewModel = {
			animationsEnabled: false,
			body: 'Delete this playlist?',
			cancelAccessibilityId: 'modal-cancel',
			confirmAccessibilityId: 'modal-confirm',
			onClose: () => {},
			onConfirm: () => {},
			title: 'Delete',
		};
		const component = driver.renderComponent(Modal, viewModel, undefined);
		const elements = component.renderer.getComponentRootElements(component, true);

		const views = elementTypeFind(elements, IRenderedElementViewClass.View);
		const styles = views.map((view) => view.getAttribute('style'));

		// the divider paints a background, so it stays a view
		expect(styles).toContain(modalStyles.divider);
		expect(styles).not.toContain(modalStyles.actions);
		expect(styles).not.toContain(modalStyles.actionButton);
		expect(styles).not.toContain(modalStyles.actionSeparator);
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

		const views = elementTypeFind(
			component.renderer.getComponentRootElements(component, true),
			IRenderedElementViewClass.View,
		);
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
