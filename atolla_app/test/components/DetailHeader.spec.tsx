import 'jasmine/src/jasmine';
import res from 'atolla_app/res';
import Strings from 'atolla_app/src/Strings';
import { ToastService } from 'atolla_app/src/services/ToastService';
import {
	DetailHeader,
	type DetailHeaderViewModel,
} from 'atolla_app/src/ui/components/DetailHeader';
import { componentGetElements } from 'foundation/test/util/componentGetElements';
import { elementTypeFind } from 'foundation/test/util/elementTypeFind';
import { Component } from 'valdi_core/src/Component';
import { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';
import { DetachedSlotRenderer } from 'valdi_core/src/slot/DetachedSlotRenderer';
import { IRenderedElementViewClass } from 'valdi_test/test/IRenderedElementViewClass';
import { InstrumentedComponentJSX, valdiIt } from 'valdi_test/test/JSXTestUtils';
import type { Asset } from 'valdi_tsx/src/Asset';
import type { TouchEvent } from 'valdi_tsx/src/GestureEvents';
import { dragEvent, touchEvent, touchEventWith } from '../util/testEvents';

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

		expect(toastService.getCurrent()?.model.message).toBe(Strings.addToQueueFailedToast());
	});

	valdiIt('renders the spinner and no download control while downloading', async (driver) => {
		const component = driver.renderComponent(
			DetailHeaderWithSlot,
			freshViewModel({ downloadState: 'downloading' }),
			undefined,
		);

		expect(findByLabel(component, 'detail-header-downloading-spinner')).toBeDefined();
		expect(findByLabel(component, 'detail-header-download-button')).toBeUndefined();
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

	valdiIt(
		'disables the fresh-download control when downloads are gated to wi-fi',
		async (driver) => {
			let downloaded = false;
			const component = driver.renderComponent(
				DetailHeaderWithSlot,
				freshViewModel({ downloadEnabled: false, onDownload: () => (downloaded = true) }),
				undefined,
			);

			const control = findByLabel(component, 'detail-header-download-button');
			control?.getAttribute('onTap')?.(touchEvent);

			expect(control?.getAttribute('onTap')).toBeUndefined();
			expect(downloaded).toBe(false);
		},
	);

	valdiIt(
		'keeps the fresh-download control tappable when downloads are allowed',
		async (driver) => {
			let downloaded = false;
			const component = driver.renderComponent(
				DetailHeaderWithSlot,
				freshViewModel({ downloadEnabled: true, onDownload: () => (downloaded = true) }),
				undefined,
			);

			findByLabel(component, 'detail-header-download-button')?.getAttribute('onTap')?.(touchEvent);

			expect(downloaded).toBe(true);
		},
	);

	valdiIt('still allows removing an existing download when gated to wi-fi', async (driver) => {
		const component = driver.renderComponent(
			DetailHeaderWithSlot,
			freshViewModel({ downloadEnabled: false, downloadState: 'downloaded' }),
			undefined,
		);

		expect(
			findByLabel(component, 'detail-header-download-button')?.getAttribute('onTap'),
		).toBeDefined();
	});

	valdiIt('draws the tick when a download finishes', async () => {
		const instrumented = InstrumentedComponentJSX.create(
			DetailHeader,
			animatedViewModel({ downloadState: 'downloading' }),
			undefined,
		);
		const component = instrumented.getComponent();

		instrumented.setViewModel(animatedViewModel({ downloadState: 'downloaded' }));

		expect(findByLabel(component, 'detail-header-downloaded-tick')).toBeDefined();
		expect(
			findByLabel(component, 'detail-header-download-icon')?.getAttribute('touchEnabled'),
		).toBe(false);
	});

	// the static icon stays mounted underneath the animation so it is already painted when the
	// tick unmounts; swapping a fresh image in at that moment flickers
	valdiIt('keeps the downloaded icon mounted while the tick draws', async () => {
		const instrumented = InstrumentedComponentJSX.create(
			DetailHeader,
			animatedViewModel({ downloadState: 'downloading' }),
			undefined,
		);
		const component = instrumented.getComponent();

		instrumented.setViewModel(animatedViewModel({ downloadState: 'downloaded' }));

		expect(findByLabel(component, 'detail-header-downloaded-tick')).toBeDefined();
		expect(rendersIcon(component, res.downloaded)).toBe(true);
	});

	valdiIt('restores the tappable downloaded control once the tick finishes', async () => {
		const instrumented = InstrumentedComponentJSX.create(
			DetailHeader,
			animatedViewModel({ downloadState: 'downloading' }),
			undefined,
		);
		const component = instrumented.getComponent();

		instrumented.setViewModel(animatedViewModel({ downloadState: 'downloaded' }));
		findAnimation(component)?.getAttribute('onProgress')?.({ duration: 0.72, time: 0.72 });

		expect(findByLabel(component, 'detail-header-downloaded-tick')).toBeUndefined();
		expect(
			findByLabel(component, 'detail-header-download-icon')?.getAttribute('touchEnabled'),
		).toBe(true);
		expect(
			findByLabel(component, 'detail-header-download-button')?.getAttribute('onTap'),
		).toBeDefined();
		expect(rendersIcon(component, res.downloaded)).toBe(true);
	});

	valdiIt('shows the static tick when mounted as already downloaded', async (driver) => {
		const component = driver.renderComponent(
			DetailHeader,
			animatedViewModel({ downloadState: 'downloaded' }),
			undefined,
		);

		expect(findByLabel(component, 'detail-header-downloaded-tick')).toBeUndefined();
		expect(rendersIcon(component, res.downloaded)).toBe(true);
	});

	valdiIt('skips the tick when animations are disabled', async () => {
		const instrumented = InstrumentedComponentJSX.create(
			DetailHeader,
			freshViewModel({ downloadState: 'downloading' }),
			undefined,
		);
		const component = instrumented.getComponent();

		instrumented.setViewModel(freshViewModel({ downloadState: 'downloaded' }));

		expect(findByLabel(component, 'detail-header-downloaded-tick')).toBeUndefined();
		expect(findByLabel(component, 'detail-header-download-button')).toBeDefined();
	});

	valdiIt('draws the tick again on a second download', async () => {
		const instrumented = InstrumentedComponentJSX.create(
			DetailHeader,
			animatedViewModel({ downloadState: 'downloading' }),
			undefined,
		);
		const component = instrumented.getComponent();

		instrumented.setViewModel(animatedViewModel({ downloadState: 'downloaded' }));
		findAnimation(component)?.getAttribute('onProgress')?.({ duration: 0.72, time: 0.72 });
		instrumented.setViewModel(animatedViewModel({ downloadState: 'not_downloaded' }));
		instrumented.setViewModel(animatedViewModel({ downloadState: 'downloading' }));
		instrumented.setViewModel(animatedViewModel({ downloadState: 'downloaded' }));

		expect(findByLabel(component, 'detail-header-downloaded-tick')).toBeDefined();

		findAnimation(component)?.getAttribute('onProgress')?.({ duration: 0.72, time: 0.72 });

		expect(findByLabel(component, 'detail-header-downloaded-tick')).toBeUndefined();
		expect(rendersIcon(component, res.downloaded)).toBe(true);
	});

	valdiIt('drops the tick when the download is removed mid-draw', async () => {
		const instrumented = InstrumentedComponentJSX.create(
			DetailHeader,
			animatedViewModel({ downloadState: 'downloading' }),
			undefined,
		);
		const component = instrumented.getComponent();

		instrumented.setViewModel(animatedViewModel({ downloadState: 'downloaded' }));
		instrumented.setViewModel(animatedViewModel({ downloadState: 'not_downloaded' }));

		expect(findByLabel(component, 'detail-header-downloaded-tick')).toBeUndefined();
		expect(rendersIcon(component, res.download)).toBe(true);
	});

	describe('artwork long press', () => {
		function touchArtwork(
			component: Parameters<typeof componentGetElements>[0],
			event: TouchEvent,
		): void {
			findByLabel(component, 'detail-header-artwork')?.getAttribute('onTouch')?.(event);
		}

		function withClock(run: () => void): void {
			jasmine.clock().install();
			try {
				run();
			} finally {
				jasmine.clock().uninstall();
			}
		}

		valdiIt('fires after holding for the long press delay', async (driver) => {
			const onArtworkLongPress = jasmine.createSpy('onArtworkLongPress');
			const component = driver.renderComponent(
				DetailHeader,
				freshViewModel({ onArtworkLongPress }),
				undefined,
			);

			withClock(() => {
				touchArtwork(component, touchEventWith({ state: 0 }));
				jasmine.clock().tick(500);
			});

			expect(onArtworkLongPress).toHaveBeenCalled();
		});

		valdiIt('does not fire before the delay elapses', async (driver) => {
			const onArtworkLongPress = jasmine.createSpy('onArtworkLongPress');
			const component = driver.renderComponent(
				DetailHeader,
				freshViewModel({ onArtworkLongPress }),
				undefined,
			);

			withClock(() => {
				touchArtwork(component, touchEventWith({ state: 0 }));
				jasmine.clock().tick(499);
			});

			expect(onArtworkLongPress).not.toHaveBeenCalled();
		});

		valdiIt('cancels when the finger moves vertically past the threshold', async (driver) => {
			const onArtworkLongPress = jasmine.createSpy('onArtworkLongPress');
			const component = driver.renderComponent(
				DetailHeader,
				freshViewModel({ onArtworkLongPress }),
				undefined,
			);

			withClock(() => {
				touchArtwork(component, touchEventWith({ state: 0 }));
				touchArtwork(component, dragEvent({ deltaX: 0, deltaY: 6, state: 1 }) as TouchEvent);
				jasmine.clock().tick(500);
			});

			expect(onArtworkLongPress).not.toHaveBeenCalled();
		});

		valdiIt('cancels when the finger moves horizontally past the threshold', async (driver) => {
			const onArtworkLongPress = jasmine.createSpy('onArtworkLongPress');
			const component = driver.renderComponent(
				DetailHeader,
				freshViewModel({ onArtworkLongPress }),
				undefined,
			);

			withClock(() => {
				touchArtwork(component, touchEventWith({ state: 0 }));
				touchArtwork(component, dragEvent({ deltaX: 6, deltaY: 0, state: 1 }) as TouchEvent);
				jasmine.clock().tick(500);
			});

			expect(onArtworkLongPress).not.toHaveBeenCalled();
		});

		valdiIt('stays armed through jitter inside the threshold', async (driver) => {
			const onArtworkLongPress = jasmine.createSpy('onArtworkLongPress');
			const component = driver.renderComponent(
				DetailHeader,
				freshViewModel({ onArtworkLongPress }),
				undefined,
			);

			withClock(() => {
				touchArtwork(component, touchEventWith({ state: 0 }));
				touchArtwork(component, dragEvent({ deltaX: 3, deltaY: 4, state: 1 }) as TouchEvent);
				jasmine.clock().tick(500);
			});

			expect(onArtworkLongPress).toHaveBeenCalled();
		});

		valdiIt('cancels when the touch ends before the delay', async (driver) => {
			const onArtworkLongPress = jasmine.createSpy('onArtworkLongPress');
			const component = driver.renderComponent(
				DetailHeader,
				freshViewModel({ onArtworkLongPress }),
				undefined,
			);

			withClock(() => {
				touchArtwork(component, touchEventWith({ state: 0 }));
				touchArtwork(component, touchEventWith({ state: 2 }));
				jasmine.clock().tick(500);
			});

			expect(onArtworkLongPress).not.toHaveBeenCalled();
		});

		valdiIt('leaves the artwork inert when no handler is supplied', async (driver) => {
			const component = driver.renderComponent(DetailHeader, freshViewModel(), undefined);

			const artwork = findByLabel(component, 'detail-header-artwork');
			expect(artwork).not.toBeUndefined();
			expect(artwork?.getAttribute('onTouch')).toBeUndefined();
			expect(artwork?.getAttribute('onTap')).toBeUndefined();
		});

		valdiIt('drops a pending long press when the header is destroyed', async (driver) => {
			const onArtworkLongPress = jasmine.createSpy('onArtworkLongPress');
			const component = driver.renderComponent(
				DetailHeader,
				freshViewModel({ onArtworkLongPress }),
				undefined,
			);

			withClock(() => {
				touchArtwork(component, touchEventWith({ state: 0 }));
				(component as unknown as { onDestroy(): void }).onDestroy();
				jasmine.clock().tick(500);
			});

			expect(onArtworkLongPress).not.toHaveBeenCalled();
		});

		valdiIt('leaves the header reveal drag intact', async (driver) => {
			const component = driver.renderComponent(
				DetailHeader,
				freshViewModel({ onArtworkLongPress: () => {} }),
				undefined,
			);

			const root = elementTypeFind(
				componentGetElements(component),
				IRenderedElementViewClass.View,
			)[0];
			expect(root?.getAttribute('onDrag')).not.toBeUndefined();
			expect(root?.getAttribute('onDragPredicate')?.(dragEvent({ deltaX: 0, deltaY: 20 }))).toBe(
				true,
			);
		});
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

function freshViewModel(overrides: Partial<DetailHeaderProps> = {}): DetailHeaderProps {
	return {
		animationsEnabled: false,
		artworkCategory: 'album_art',
		artworkSource: null,
		downloadState: 'not_downloaded',
		onDownload: () => {},
		onRemoveDownload: () => {},
		toastService: new ToastService(),
		...overrides,
	};
}

function animatedViewModel(overrides: Partial<DetailHeaderProps> = {}): DetailHeaderProps {
	return freshViewModel({ animationsEnabled: true, ...overrides });
}

function findAnimation(component: Parameters<typeof componentGetElements>[0]) {
	return elementTypeFind(
		componentGetElements(component),
		IRenderedElementViewClass.AnimatedImage,
	)[0];
}

function findByLabel(component: Parameters<typeof componentGetElements>[0], label: string) {
	const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
	return views.find((view) => view.getAttribute('accessibilityLabel') === label);
}

function rendersIcon(component: Parameters<typeof componentGetElements>[0], icon: Asset): boolean {
	const images = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.Image);
	return images.some((image) => image.getAttribute('src') === icon);
}
