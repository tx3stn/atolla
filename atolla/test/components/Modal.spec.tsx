import 'jasmine/src/jasmine';
import { Modal } from 'atolla/src/ui/components/Modal';
import { elementTypeFind } from 'foundation/test/util/elementTypeFind';
import { IRenderedElementViewClass } from 'valdi_test/test/IRenderedElementViewClass';
import { createComponent, valdiIt } from 'valdi_test/test/JSXTestUtils';
import { renderedElements } from './renderedElements';

describe('Modal', () => {
	valdiIt('renders artist logo through cache image source', async () => {
		const instrumented = createComponent(Modal, {
			body: 'Long artist bio',
			logoUrl: 'https://example.com/artist-logo.png',
			onClose: () => {},
			title: 'Artist Name',
		});
		const component = instrumented.getComponent();

		const images = elementTypeFind(renderedElements(component), IRenderedElementViewClass.Image);

		expect(images.length).toBe(1);
		expect(images[0].getAttribute('src')).toContain('atolla-cache://image?c=artist_logo&u=');
	});
});
