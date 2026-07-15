import 'jasmine/src/jasmine';
import Strings from 'atolla/src/Strings';
import { ToastService } from 'atolla/src/services/ToastService';
import { DetailHeader, type DetailHeaderViewModel } from 'atolla/src/ui/components/DetailHeader';
import { componentGetElements } from 'foundation/test/util/componentGetElements';
import { elementTypeFind } from 'foundation/test/util/elementTypeFind';
import { Component } from 'valdi_core/src/Component';
import { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';
import { DetachedSlotRenderer } from 'valdi_core/src/slot/DetachedSlotRenderer';
import { IRenderedElementViewClass } from 'valdi_test/test/IRenderedElementViewClass';
import { valdiIt } from 'valdi_test/test/JSXTestUtils';
import { touchEvent } from '../util/testEvents';

describe('DetailHeader', () => {
	valdiIt('shows a toast when add to queue fails', async (driver) => {
		const toastService = new ToastService();
		const viewModel = {
			animationsEnabled: false,
			artworkCategory: 'album_art',
			artworkSource: null,
			onAddToQueue: () => Promise.reject(new Error('failed')),
			toastService,
		};
		const component = driver.renderComponent(DetailHeader, viewModel, undefined);

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		views
			.find((v) => v.getAttribute('accessibilityLabel') === 'detail-header-add-to-queue-button')
			?.getAttribute('onTap')?.(touchEvent);

		// the add-to-queue handler is async; let the awaited rejection settle so the catch
		// block shows the toast
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(toastService.getMessage()).toBe(Strings.addToQueueFailedToast());
	});

	valdiIt(
		'renders a tappable download control, not the spinner, for a partial download',
		async (driver) => {
			const component = driver.renderComponent(DetailHeaderWithSlot, partialViewModel(), undefined);

			expect(findByLabel(component, 'detail-header-download-button')).toBeDefined();
			expect(findByLabel(component, 'detail-header-downloading-spinner')).toBeUndefined();
		},
	);

	valdiIt('retries the failed tracks when the partial modal Retry is tapped', async (driver) => {
		let retried = false;
		const component = driver.renderComponent(
			DetailHeaderWithSlot,
			partialViewModel({ onDownload: () => (retried = true) }),
			undefined,
		);

		findByLabel(component, 'detail-header-download-button')?.getAttribute('onTap')?.(touchEvent);
		findByLabel(component, 'detail-header-partial-download-retry-btn')?.getAttribute('onTap')?.(
			touchEvent,
		);

		expect(retried).toBe(true);
	});

	valdiIt('removes the download when the partial modal Remove is tapped', async (driver) => {
		let removed = false;
		const component = driver.renderComponent(
			DetailHeaderWithSlot,
			partialViewModel({ onRemoveDownload: () => (removed = true) }),
			undefined,
		);

		findByLabel(component, 'detail-header-download-button')?.getAttribute('onTap')?.(touchEvent);
		findByLabel(component, 'detail-header-partial-download-remove-btn')?.getAttribute('onTap')?.(
			touchEvent,
		);

		expect(removed).toBe(true);
	});
});

type DetailHeaderProps = Omit<DetailHeaderViewModel, 'modalSlot'>;

// renders the header alongside a DetachedSlotRenderer so the partial-download modal (which is
// slotted, as in production) appears in the same tree and can be interacted with
class DetailHeaderWithSlot extends Component<DetailHeaderProps> {
	private slot = new DetachedSlot();

	onRender(): void {
		<view>
			<DetailHeader {...this.viewModel} modalSlot={this.slot} />
			<DetachedSlotRenderer detachedSlot={this.slot} />
		</view>;
	}
}

function partialViewModel(overrides: Partial<DetailHeaderProps> = {}): DetailHeaderProps {
	return {
		animationsEnabled: false,
		artworkCategory: 'album_art',
		artworkSource: null,
		downloadState: 'partial',
		onDownload: () => {},
		onRemoveDownload: () => {},
		toastService: new ToastService(),
		...overrides,
	};
}

function findByLabel(component: Parameters<typeof componentGetElements>[0], label: string) {
	const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
	return views.find((view) => view.getAttribute('accessibilityLabel') === label);
}
