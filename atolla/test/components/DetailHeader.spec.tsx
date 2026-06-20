import 'jasmine/src/jasmine';
import Strings from 'atolla/src/Strings';
import { DetailHeader } from 'atolla/src/ui/components/DetailHeader';
import { ToastService } from 'atolla/src/ui/components/ToastService';
import { componentGetElements } from 'foundation/test/util/componentGetElements';
import { elementTypeFind } from 'foundation/test/util/elementTypeFind';
import { IRenderedElementViewClass } from 'valdi_test/test/IRenderedElementViewClass';
import { createComponent, valdiIt } from 'valdi_test/test/JSXTestUtils';
import { touchEvent } from '../util/testEvents';

describe('DetailHeader', () => {
	valdiIt('shows a toast when add to queue fails', async () => {
		const toastService = new ToastService();
		const instrumented = createComponent(DetailHeader, {
			animationsEnabled: false,
			artworkCategory: 'album_art',
			artworkSource: null,
			onAddToQueue: () => Promise.reject(new Error('failed')),
			toastService,
		});
		const component = instrumented.getComponent();

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		views
			.find((v) => v.getAttribute('accessibilityLabel') === 'detail-header-add-to-queue-button')
			?.getAttribute('onTap')?.(touchEvent);

		// The add-to-queue handler is async; let the awaited rejection settle so
		// the catch block shows the toast.
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(toastService.getMessage()).toBe(Strings.addToQueueFailedToast());
	});
});
