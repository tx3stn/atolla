import 'jasmine/src/jasmine';
import type { ClearCacheSelection } from 'atolla/src/services/ImageCache';
import { ToastService } from 'atolla/src/services/ToastService';
import { Preferences } from 'atolla/src/stores/Preferences';
import { SettingsView, type SettingsViewModel } from 'atolla/src/ui/views/SettingsView';
import { componentGetElements } from 'foundation/test/util/componentGetElements';
import { elementTypeFind } from 'foundation/test/util/elementTypeFind';
import { Component } from 'valdi_core/src/Component';
import { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';
import { DetachedSlotRenderer } from 'valdi_core/src/slot/DetachedSlotRenderer';
import { IRenderedElementViewClass } from 'valdi_test/test/IRenderedElementViewClass';
import { valdiIt } from 'valdi_test/test/JSXTestUtils';
import { editTextEvent, touchEvent } from '../util/testEvents';

// Wrapper that renders SettingsView alongside a DetachedSlotRenderer so that
// slot-rendered modals appear in the same component tree as the main view.
class SettingsViewWithSlot extends Component<Partial<SettingsViewModel>> {
	private slot = new DetachedSlot();

	onRender() {
		const vm = this.viewModel as unknown as SettingsViewModel;
		<view>
			<SettingsView modalSlot={this.slot} {...vm} />
			<DetachedSlotRenderer detachedSlot={this.slot} />
		</view>;
	}
}

function mockPreferences() {
	return new Preferences({
		fetchString: () => Promise.reject(new Error()),
		storeString: () => Promise.resolve(),
	});
}

describe('SettingsView', () => {
	valdiIt('renders cache section title and clear cache label', async (driver) => {
		const viewModel = {
			imageCacheMaxBytes: 2 * 1024 * 1024 * 1024,
			onCacheSizeChange: () => {},
			preferences: mockPreferences(),
		};
		const component = driver.renderComponent(SettingsView, viewModel, undefined);
		const labels = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.Label,
		);
		const values = labels.map((label) => label.getAttribute('value'));

		expect(values).toContain('CACHE');
		expect(values).toContain('clear cache');
	});

	valdiIt('renders clear cache button with accessibility labels', async (driver) => {
		const viewModel = {
			imageCacheMaxBytes: 2 * 1024 * 1024 * 1024,
			onCacheSizeChange: () => {},
			preferences: mockPreferences(),
		};
		const component = driver.renderComponent(SettingsView, viewModel, undefined);
		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const clearCacheButton = views.find(
			(view) => view.getAttribute('accessibilityLabel') === 'settings-cache-clear-btn',
		);

		expect(clearCacheButton).toBeTruthy();
		expect(typeof clearCacheButton?.getAttribute('onTap')).toBe('function');
	});

	valdiIt('tapping logout button shows the confirm modal', async (driver) => {
		const viewModel = {
			preferences: mockPreferences(),
		};
		const component = driver.renderComponent(SettingsViewWithSlot, viewModel, undefined);

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		views
			.find((v) => v.getAttribute('accessibilityLabel') === 'settings-logout-btn')
			?.getAttribute('onTap')?.(touchEvent);

		const modalConfirm = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.View,
		).find((v) => v.getAttribute('accessibilityLabel') === 'settings-logout-confirm-btn');

		expect(modalConfirm).toBeTruthy();
	});

	valdiIt('calls onLogout when logout confirm modal is confirmed', async (driver) => {
		let called = false;
		const viewModel = {
			onLogout: () => {
				called = true;
			},
			preferences: mockPreferences(),
		};
		const component = driver.renderComponent(SettingsViewWithSlot, viewModel, undefined);

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		views
			.find((v) => v.getAttribute('accessibilityLabel') === 'settings-logout-btn')
			?.getAttribute('onTap')?.(touchEvent);

		const modalViews = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.View,
		);
		modalViews
			.find((v) => v.getAttribute('accessibilityLabel') === 'settings-logout-confirm-btn')
			?.getAttribute('onTap')?.(touchEvent);

		expect(called).toBe(true);
	});

	valdiIt('does not call onLogout when logout confirm modal is cancelled', async (driver) => {
		let called = false;
		const viewModel = {
			onLogout: () => {
				called = true;
			},
			preferences: mockPreferences(),
		};
		const component = driver.renderComponent(SettingsView, viewModel, undefined);

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		views
			.find((v) => v.getAttribute('accessibilityLabel') === 'settings-logout-btn')
			?.getAttribute('onTap')?.(touchEvent);

		const modalViews = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.View,
		);
		modalViews
			.find((v) => v.getAttribute('accessibilityLabel') === 'settings-logout-cancel-btn')
			?.getAttribute('onTap')?.(touchEvent);

		expect(called).toBe(false);
	});

	valdiIt('tapping clear cache button shows the cache clear modal', async (driver) => {
		const viewModel = {
			preferences: mockPreferences(),
		};
		const component = driver.renderComponent(SettingsViewWithSlot, viewModel, undefined);

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		views
			.find((v) => v.getAttribute('accessibilityLabel') === 'settings-cache-clear-btn')
			?.getAttribute('onTap')?.(touchEvent);

		const updatedViews = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.View,
		);
		const modal = updatedViews.find(
			(v) => v.getAttribute('accessibilityLabel') === 'cache-clear-modal',
		);

		expect(modal).toBeTruthy();
	});

	valdiIt('calls onClearCache with selection when modal is confirmed', async (driver) => {
		let received: ClearCacheSelection | undefined;
		const viewModel = {
			onClearCache: (selection: ClearCacheSelection) => {
				received = selection;
			},
			preferences: mockPreferences(),
			toastService: new ToastService(),
		};
		const component = driver.renderComponent(SettingsViewWithSlot, viewModel, undefined);

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		views
			.find((v) => v.getAttribute('accessibilityLabel') === 'settings-cache-clear-btn')
			?.getAttribute('onTap')?.(touchEvent);

		const modalViews = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.View,
		);
		modalViews
			.find((v) => v.getAttribute('accessibilityLabel') === 'cache-clear-confirm-btn')
			?.getAttribute('onTap')?.(touchEvent);

		expect(received).toEqual({
			albumArt: true,
			albumArtBlurred: true,
			artistImage: true,
			artistLogo: true,
			genreImage: true,
			playlistImage: true,
			tracks: true,
			waveformData: true,
		});
	});

	valdiIt('shows toast after confirming cache clear', async (driver) => {
		const toastService = new ToastService();
		const viewModel = {
			onClearCache: () => {},
			preferences: mockPreferences(),
			toastService,
		};
		const component = driver.renderComponent(SettingsViewWithSlot, viewModel, undefined);

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		views
			.find((v) => v.getAttribute('accessibilityLabel') === 'settings-cache-clear-btn')
			?.getAttribute('onTap')?.(touchEvent);

		const modalViews = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.View,
		);
		modalViews
			.find((v) => v.getAttribute('accessibilityLabel') === 'cache-clear-confirm-btn')
			?.getAttribute('onTap')?.(touchEvent);

		expect(toastService.getMessage()).toBeTruthy();
	});

	valdiIt('shows toast after clearing the debug log', async (driver) => {
		const toastService = new ToastService();
		const viewModel = {
			debugLoggingEnabled: true,
			onClearDebugLog: () => {},
			preferences: mockPreferences(),
			toastService,
		};
		const component = driver.renderComponent(SettingsView, viewModel, undefined);

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		views
			.find((v) => v.getAttribute('accessibilityLabel') === 'settings-debug-log-clear-btn')
			?.getAttribute('onTap')?.(touchEvent);

		expect(toastService.getMessage()).toBeTruthy();
	});

	valdiIt('shows toast after exporting offline status completes', async (driver) => {
		let called = false;
		const toastService = new ToastService();
		const viewModel = {
			onExportOfflineStatus: () => {
				called = true;
			},
			preferences: mockPreferences(),
			toastService,
		};
		const component = driver.renderComponent(SettingsView, viewModel, undefined);

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		views
			.find((v) => v.getAttribute('accessibilityLabel') === 'settings-export-offline-status-btn')
			?.getAttribute('onTap')?.(touchEvent);

		// The export handler is async; let the awaited export resolve before the
		// toast is shown.
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(called).toBe(true);
		expect(toastService.getMessage()).toBeTruthy();
	});

	valdiIt('shows cached tracks dropdown options when tapped', async (driver) => {
		const viewModel = {
			preferences: mockPreferences(),
			trackCacheMaxTracks: 20,
		};
		const component = driver.renderComponent(SettingsView, viewModel, undefined);

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		views
			.find((v) => v.getAttribute('accessibilityLabel') === 'settings-track-cache-limit-dropdown')
			?.getAttribute('onTap')?.(touchEvent);

		const updatedViews = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.View,
		);
		const option = updatedViews.find(
			(v) => v.getAttribute('accessibilityId') === 'settings-track-cache-limit-option-25',
		);

		expect(option).toBeTruthy();
	});

	valdiIt(
		'calls onTrackCacheMaxTracksChange when selecting a cached tracks option',
		async (driver) => {
			let selected = 0;
			const viewModel = {
				onTrackCacheMaxTracksChange: (count: number) => {
					selected = count;
				},
				preferences: mockPreferences(),
				trackCacheMaxTracks: 20,
			};
			const component = driver.renderComponent(SettingsView, viewModel, undefined);

			const views = elementTypeFind(
				componentGetElements(component),
				IRenderedElementViewClass.View,
			);
			views
				.find((v) => v.getAttribute('accessibilityLabel') === 'settings-track-cache-limit-dropdown')
				?.getAttribute('onTap')?.(touchEvent);

			const updatedViews = elementTypeFind(
				componentGetElements(component),
				IRenderedElementViewClass.View,
			);
			updatedViews
				.find((v) => v.getAttribute('accessibilityId') === 'settings-track-cache-limit-option-30')
				?.getAttribute('onTap')?.(touchEvent);

			expect(selected).toBe(30);
		},
	);

	valdiIt('shows grid columns options when tapped', async (driver) => {
		const viewModel = {
			gridColumns: 3,
			preferences: mockPreferences(),
		};
		const component = driver.renderComponent(SettingsView, viewModel, undefined);

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		views
			.find((v) => v.getAttribute('accessibilityLabel') === 'settings-grid-columns-dropdown')
			?.getAttribute('onTap')?.(touchEvent);

		const updatedViews = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.View,
		);
		const option = updatedViews.find(
			(v) => v.getAttribute('accessibilityId') === 'settings-grid-columns-option-4',
		);

		expect(option).toBeTruthy();
	});

	valdiIt('calls onGridColumnsChange when selecting a grid columns option', async (driver) => {
		let selected = 0;
		const viewModel = {
			gridColumns: 3,
			onGridColumnsChange: (count: number) => {
				selected = count;
			},
			preferences: mockPreferences(),
		};
		const component = driver.renderComponent(SettingsView, viewModel, undefined);

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		views
			.find((v) => v.getAttribute('accessibilityLabel') === 'settings-grid-columns-dropdown')
			?.getAttribute('onTap')?.(touchEvent);

		const updatedViews = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.View,
		);
		updatedViews
			.find((v) => v.getAttribute('accessibilityId') === 'settings-grid-columns-option-4')
			?.getAttribute('onTap')?.(touchEvent);

		expect(selected).toBe(4);
	});

	valdiIt('does not call onClearCache when modal is cancelled', async (driver) => {
		let called = false;
		const viewModel = {
			onClearCache: () => {
				called = true;
			},
			preferences: mockPreferences(),
		};
		const component = driver.renderComponent(SettingsView, viewModel, undefined);

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		views
			.find((v) => v.getAttribute('accessibilityLabel') === 'settings-cache-clear-btn')
			?.getAttribute('onTap')?.(touchEvent);

		const modalViews = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.View,
		);
		modalViews
			.find((v) => v.getAttribute('accessibilityLabel') === 'cache-clear-cancel-btn')
			?.getAttribute('onTap')?.(touchEvent);

		expect(called).toBe(false);
	});

	valdiIt('tapping delete all downloads button shows the confirm modal', async (driver) => {
		const viewModel = {
			preferences: mockPreferences(),
		};
		const component = driver.renderComponent(SettingsViewWithSlot, viewModel, undefined);

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		views
			.find((v) => v.getAttribute('accessibilityLabel') === 'settings-downloads-delete-all-btn')
			?.getAttribute('onTap')?.(touchEvent);

		const modalConfirm = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.View,
		).find((v) => v.getAttribute('accessibilityLabel') === 'settings-downloads-clear-confirm-btn');

		expect(modalConfirm).toBeTruthy();
	});

	valdiIt('calls onClearDownloads when downloads clear modal is confirmed', async (driver) => {
		let called = false;
		const viewModel = {
			onClearDownloads: () => {
				called = true;
			},
			preferences: mockPreferences(),
		};
		const component = driver.renderComponent(SettingsViewWithSlot, viewModel, undefined);

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		views
			.find((v) => v.getAttribute('accessibilityLabel') === 'settings-downloads-delete-all-btn')
			?.getAttribute('onTap')?.(touchEvent);

		const modalViews = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.View,
		);
		modalViews
			.find((v) => v.getAttribute('accessibilityLabel') === 'settings-downloads-clear-confirm-btn')
			?.getAttribute('onTap')?.(touchEvent);

		expect(called).toBe(true);
	});

	valdiIt(
		'does not call onClearDownloads when downloads clear modal is cancelled',
		async (driver) => {
			let called = false;
			const viewModel = {
				onClearDownloads: () => {
					called = true;
				},
				preferences: mockPreferences(),
			};
			const component = driver.renderComponent(SettingsView, viewModel, undefined);

			const views = elementTypeFind(
				componentGetElements(component),
				IRenderedElementViewClass.View,
			);
			views
				.find((v) => v.getAttribute('accessibilityLabel') === 'settings-downloads-delete-all-btn')
				?.getAttribute('onTap')?.(touchEvent);

			const modalViews = elementTypeFind(
				componentGetElements(component),
				IRenderedElementViewClass.View,
			);
			modalViews
				.find((v) => v.getAttribute('accessibilityLabel') === 'settings-downloads-clear-cancel-btn')
				?.getAttribute('onTap')?.(touchEvent);

			expect(called).toBe(false);
		},
	);

	valdiIt(
		'calls onJellyfinDeviceIdOverrideChange when auth device id input changes',
		async (driver) => {
			const received: Array<string> = [];
			const viewModel = {
				onJellyfinDeviceIdOverrideChange: (value: string) => {
					received.push(value);
				},
				preferences: mockPreferences(),
			};
			const component = driver.renderComponent(SettingsView, viewModel, undefined);
			const textFields = elementTypeFind(
				componentGetElements(component),
				IRenderedElementViewClass.TextField,
			);

			textFields
				.find(
					(field) =>
						field.getAttribute('accessibilityLabel') === 'settings-jellyfin-device-id-input',
				)
				?.getAttribute('onChange')?.(editTextEvent('custom-profile-device'));

			expect(received).toEqual(['custom-profile-device']);
		},
	);

	valdiIt('renders the server name in a disabled field', async (driver) => {
		const viewModel = {
			preferences: mockPreferences(),
			serverName: 'Living Room Server',
		};
		const component = driver.renderComponent(SettingsView, viewModel, undefined);
		const textFields = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.TextField,
		);
		const serverNameField = textFields.find(
			(field) => field.getAttribute('accessibilityLabel') === 'settings-jellyfin-server-name-input',
		);

		expect(serverNameField).toBeTruthy();
		expect(serverNameField?.getAttribute('value')).toBe('Living Room Server');
		expect(serverNameField?.getAttribute('enabled')).toBe(false);
		expect(serverNameField?.getAttribute('onChange')).toBeUndefined();
	});

	valdiIt('does not render auth device id reset button', async (driver) => {
		const viewModel = {
			preferences: mockPreferences(),
		};
		const component = driver.renderComponent(SettingsView, viewModel, undefined);
		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const resetButton = views.find(
			(view) => view.getAttribute('accessibilityLabel') === 'settings-jellyfin-device-id-reset-btn',
		);

		expect(resetButton).toBeUndefined();
	});
});
