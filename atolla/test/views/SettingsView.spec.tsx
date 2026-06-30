import 'jasmine/src/jasmine';
import type { ArtworkPaletteService } from 'atolla/src/services/ArtworkPaletteService';
import type { DownloadService } from 'atolla/src/services/DownloadService';
import type { PlaybackOrchestrator } from 'atolla/src/services/PlaybackOrchestrator';
import { SessionController } from 'atolla/src/services/SessionController';
import { ToastService } from 'atolla/src/services/ToastService';
import { Preferences } from 'atolla/src/stores/Preferences';
import { type ConnectionMode, ConnectionModes } from 'atolla/src/transports/Model';
import { SettingsView, type SettingsViewModel } from 'atolla/src/ui/views/SettingsView';
import { componentGetElements } from 'foundation/test/util/componentGetElements';
import { elementTypeFind } from 'foundation/test/util/elementTypeFind';
import { Component } from 'valdi_core/src/Component';
import { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';
import { DetachedSlotRenderer } from 'valdi_core/src/slot/DetachedSlotRenderer';
import { IRenderedElementViewClass } from 'valdi_test/test/IRenderedElementViewClass';
import { valdiIt } from 'valdi_test/test/JSXTestUtils';
import { editTextEvent, touchEvent } from '../util/testEvents';

// wrapper that renders the settings view alongside a DetachedSlotRenderer so slot-rendered modals
// appear in the same component tree as the main view
class SettingsViewWithSlot extends Component<SettingsViewModel> {
	private slot = new DetachedSlot();

	onRender() {
		<view>
			<SettingsView {...this.viewModel} modalSlot={this.slot} />
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

interface SessionCalls {
	applyDeviceIdOverride: Array<string>;
	logout: number;
	requestModeChange: Array<ConnectionMode>;
}

function makeSessionController(info?: {
	connectionMode?: ConnectionMode;
	defaultDeviceId?: string;
	serverName?: string;
	serverUrl?: string;
}): { calls: SessionCalls; controller: SessionController } {
	const calls: SessionCalls = { applyDeviceIdOverride: [], logout: 0, requestModeChange: [] };
	const controller = new SessionController();
	controller.register({
		applyDeviceIdOverride: (value) => calls.applyDeviceIdOverride.push(value),
		connectionMode: () => info?.connectionMode ?? ConnectionModes.online,
		defaultDeviceId: () => info?.defaultDeviceId ?? 'atolla-test',
		logout: () => {
			calls.logout += 1;
		},
		requestModeChange: (mode) => {
			calls.requestModeChange.push(mode);
			return Promise.resolve(true);
		},
		serverName: () => info?.serverName ?? '',
		serverUrl: () => info?.serverUrl ?? '',
	});
	return { calls, controller };
}

function makeDownloadService(overrides?: Partial<DownloadService>): DownloadService {
	return {
		getDownloadedTrackCount: () => 0,
		getTotalDownloadedSizeBytes: () => 0,
		removeAllDownloads: () => {},
		subscribe: () => () => {},
		...overrides,
	} as unknown as DownloadService;
}

function makePlaybackOrchestrator(overrides?: Partial<PlaybackOrchestrator>): PlaybackOrchestrator {
	return {
		clearWaveformData: () => {},
		getWaveformReadyCount: () => 0,
		resetForTrackCacheCleared: () => {},
		...overrides,
	} as unknown as PlaybackOrchestrator;
}

const paletteServiceStub = {
	clearAll: () => Promise.resolve(),
} as unknown as ArtworkPaletteService;

function makeViewModel(overrides?: Partial<SettingsViewModel>): SettingsViewModel {
	return {
		downloadService: makeDownloadService(),
		modalSlot: new DetachedSlot(),
		paletteService: paletteServiceStub,
		playbackOrchestrator: makePlaybackOrchestrator(),
		preferences: mockPreferences(),
		sessionController: makeSessionController().controller,
		toastService: new ToastService(),
		visible: false,
		...overrides,
	};
}

describe('SettingsView', () => {
	valdiIt(
		'renders the server name from the session controller in a disabled field',
		async (driver) => {
			const viewModel = makeViewModel({
				sessionController: makeSessionController({ serverName: 'Living Room Server' }).controller,
			});
			const component = driver.renderComponent(SettingsView, viewModel, undefined);

			const serverNameField = elementTypeFind(
				componentGetElements(component),
				IRenderedElementViewClass.TextField,
			).find(
				(field) =>
					field.getAttribute('accessibilityLabel') === 'settings-jellyfin-server-name-input',
			);

			expect(serverNameField?.getAttribute('value')).toBe('Living Room Server');
			expect(serverNameField?.getAttribute('enabled')).toBe(false);
		},
	);

	valdiIt(
		'writes the device id to preferences and applies it via the session controller',
		async (driver) => {
			const preferences = mockPreferences();
			const { calls, controller } = makeSessionController();
			const viewModel = makeViewModel({ preferences, sessionController: controller });
			const component = driver.renderComponent(SettingsView, viewModel, undefined);

			elementTypeFind(componentGetElements(component), IRenderedElementViewClass.TextField)
				.find(
					(field) =>
						field.getAttribute('accessibilityLabel') === 'settings-jellyfin-device-id-input',
				)
				?.getAttribute('onChange')?.(editTextEvent('custom-profile-device'));

			expect(preferences.jellyfinClientDeviceIdOverride).toBe('custom-profile-device');
			expect(calls.applyDeviceIdOverride).toEqual(['custom-profile-device']);
		},
	);

	valdiIt('normalises disallowed characters in the device id before storing', async (driver) => {
		const preferences = mockPreferences();
		const viewModel = makeViewModel({ preferences });
		const component = driver.renderComponent(SettingsView, viewModel, undefined);

		elementTypeFind(componentGetElements(component), IRenderedElementViewClass.TextField)
			.find(
				(field) => field.getAttribute('accessibilityLabel') === 'settings-jellyfin-device-id-input',
			)
			?.getAttribute('onChange')?.(editTextEvent('bad id!@#'));

		expect(preferences.jellyfinClientDeviceIdOverride).toBe('bad_id___');
	});

	valdiIt('writes the selected grid columns to preferences', async (driver) => {
		const preferences = mockPreferences();
		const viewModel = makeViewModel({ preferences });
		const component = driver.renderComponent(SettingsView, viewModel, undefined);

		elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View)
			.find((v) => v.getAttribute('accessibilityLabel') === 'settings-grid-columns-dropdown')
			?.getAttribute('onTap')?.(touchEvent);
		elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View)
			.find((v) => v.getAttribute('accessibilityId') === 'settings-grid-columns-option-4')
			?.getAttribute('onTap')?.(touchEvent);

		expect(preferences.gridColumns).toBe(4);
	});

	valdiIt('toggling animations writes to preferences', async (driver) => {
		const preferences = mockPreferences();
		const viewModel = makeViewModel({ preferences });
		const component = driver.renderComponent(SettingsView, viewModel, undefined);

		elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View)
			.find((v) => v.getAttribute('accessibilityLabel') === 'settings-animations-toggle')
			?.getAttribute('onTap')?.(touchEvent);

		expect(preferences.animationsEnabled).toBe(false);
	});

	valdiIt('logout confirm routes to the session controller', async (driver) => {
		const { calls, controller } = makeSessionController();
		const viewModel = makeViewModel({ sessionController: controller });
		const component = driver.renderComponent(SettingsViewWithSlot, viewModel, undefined);

		elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View)
			.find((v) => v.getAttribute('accessibilityLabel') === 'settings-logout-btn')
			?.getAttribute('onTap')?.(touchEvent);
		elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View)
			.find((v) => v.getAttribute('accessibilityLabel') === 'settings-logout-confirm-btn')
			?.getAttribute('onTap')?.(touchEvent);

		expect(calls.logout).toBe(1);
	});

	valdiIt('clear downloads confirm calls the download service', async (driver) => {
		let removed = 0;
		const downloadService = makeDownloadService({
			removeAllDownloads: () => {
				removed += 1;
			},
		});
		const viewModel = makeViewModel({ downloadService });
		const component = driver.renderComponent(SettingsViewWithSlot, viewModel, undefined);

		elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View)
			.find((v) => v.getAttribute('accessibilityLabel') === 'settings-downloads-delete-all-btn')
			?.getAttribute('onTap')?.(touchEvent);
		elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View)
			.find((v) => v.getAttribute('accessibilityLabel') === 'settings-downloads-clear-confirm-btn')
			?.getAttribute('onTap')?.(touchEvent);

		expect(removed).toBe(1);
	});

	valdiIt('cache clear confirm clears track caches and shows a toast', async (driver) => {
		let resetForTrackCacheCleared = 0;
		const playbackOrchestrator = makePlaybackOrchestrator({
			resetForTrackCacheCleared: () => {
				resetForTrackCacheCleared += 1;
			},
		});
		const toastService = new ToastService();
		const viewModel = makeViewModel({ playbackOrchestrator, toastService });
		const component = driver.renderComponent(SettingsViewWithSlot, viewModel, undefined);

		elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View)
			.find((v) => v.getAttribute('accessibilityLabel') === 'settings-cache-clear-btn')
			?.getAttribute('onTap')?.(touchEvent);
		elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View)
			.find((v) => v.getAttribute('accessibilityLabel') === 'cache-clear-confirm-btn')
			?.getAttribute('onTap')?.(touchEvent);

		expect(resetForTrackCacheCleared).toBe(1);
		expect(toastService.getMessage()).toBeTruthy();
	});
});
