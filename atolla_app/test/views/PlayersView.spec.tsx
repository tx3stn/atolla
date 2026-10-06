import 'jasmine/src/jasmine';
import {
	DEFAULT_PLAYER_GROUP,
	type Player,
	PlayerStates,
	PlayerTiers,
} from 'atolla_app/src/models/Player';
import Strings from 'atolla_app/src/Strings';
import { ToastService } from 'atolla_app/src/services/ToastService';
import type { PlayerClientPort } from 'atolla_app/src/stores/Players';
import { PlayersStore } from 'atolla_app/src/stores/Players';
import { Preferences } from 'atolla_app/src/stores/Preferences';
import { PlayersView, type PlayersViewModel } from 'atolla_app/src/ui/views/PlayersView';
import type { PlayerAnswer } from 'atolla_sync/src/api/PlayerClient';
import { componentGetElements } from 'foundation/test/util/componentGetElements';
import { elementTypeFind } from 'foundation/test/util/elementTypeFind';
import { untilRenderComplete } from 'foundation/test/util/untilRenderComplete';
import { Component } from 'valdi_core/src/Component';
import type { IRenderedElement } from 'valdi_core/src/IRenderedElement';
import { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';
import { DetachedSlotRenderer } from 'valdi_core/src/slot/DetachedSlotRenderer';
import { IRenderedElementViewClass } from 'valdi_test/test/IRenderedElementViewClass';
import type { IComponentTestDriver } from 'valdi_test/test/JSXTestUtils';
import { InstrumentedComponentJSX, valdiIt } from 'valdi_test/test/JSXTestUtils';
import { editTextEvent, touchEvent, touchEventWith } from '../util/testEvents';

interface PlayersViewHostViewModel {
	playersStore: PlayersStore;
	preferences: Preferences;
	toastService: ToastService;
}

class PlayersViewHost extends Component<PlayersViewHostViewModel> {
	private slot = new DetachedSlot();

	onRender(): void {
		<view>
			<PlayersView
				active={true}
				language='en'
				modalSlot={this.slot}
				playersStore={this.viewModel.playersStore}
				preferences={this.viewModel.preferences}
				toastService={this.viewModel.toastService}
			/>
			<DetachedSlotRenderer detachedSlot={this.slot} />
		</view>;
	}
}

const KITCHEN = { baseUrl: 'http://192.168.1.42:45889', id: 'a', name: 'Kitchen' };
const STUDY = { baseUrl: 'http://192.168.1.51:45889', id: 'b', name: 'Study' };
const PAIRABLE = [KITCHEN, STUDY];

describe('PlayersView', () => {
	valdiIt('offers this phone and nothing else before anything is paired', async (driver) => {
		const component = render(driver, new PlayersStore({ seed: [] }));

		const cards = accessibilityIds(component).filter(
			(id) => id.startsWith('player-card-') && !/-(drag|status-dot|toggle)$/.test(id),
		);
		expect(cards).toEqual(['player-card-this-device']);
		expect(accessibilityIds(component)).toContain('players-add-btn');
	});

	valdiIt('renders a card per player', async (driver) => {
		const store = new PlayersStore({ seed: [makePlayer('a'), makePlayer('b')] });

		const component = render(driver, store);

		expect(accessibilityIds(component)).toContain('player-card-a');
		expect(accessibilityIds(component)).toContain('player-card-b');
	});

	valdiIt('hides the group header while everything is in one group', async (driver) => {
		const store = new PlayersStore({ seed: [makePlayer('a'), makePlayer('b')] });

		const component = render(driver, store);

		expect(accessibilityIds(component)).not.toContain(`players-group-${DEFAULT_PLAYER_GROUP}`);
	});

	valdiIt('shows a group header once there is more than one group', async (driver) => {
		const store = new PlayersStore({
			seed: [makePlayer('a'), makePlayer('b', { group: 'upstairs' })],
		});

		const component = render(driver, store);

		expect(accessibilityIds(component)).toContain(`players-group-${DEFAULT_PLAYER_GROUP}`);
		expect(accessibilityIds(component)).toContain('players-group-upstairs');
	});

	valdiIt('titles this device with the configured device name', async (driver) => {
		const store = new PlayersStore({ deviceName: () => 'Pocket Radio', seed: [] });

		const component = render(driver, store);

		expect(labelValues(component)).toContain('Pocket Radio');
	});

	valdiIt('switches a player on through the store', async (driver) => {
		const store = new PlayersStore({ seed: [makePlayer('a', { enabled: false })] });
		const component = render(driver, store);

		elementById(component, 'player-card-a-toggle')?.getAttribute('onTap')?.(touchEvent);

		expect(isEnabled(store, 'a')).toBe(true);
	});

	valdiIt('switches a player off through the store', async (driver) => {
		const store = new PlayersStore({ seed: [makePlayer('a', { enabled: true })] });
		const component = render(driver, store);

		elementById(component, 'player-card-a-toggle')?.getAttribute('onTap')?.(touchEvent);

		expect(isEnabled(store, 'a')).toBe(false);
	});

	valdiIt('toggles only the player whose switch was tapped', async (driver) => {
		const store = new PlayersStore({ seed: [makePlayer('a'), makePlayer('b')] });
		const component = render(driver, store);

		elementById(component, 'player-card-b-toggle')?.getAttribute('onTap')?.(touchEvent);

		expect(isEnabled(store, 'a')).toBe(true);
		expect(isEnabled(store, 'b')).toBe(false);
	});

	valdiIt('opens the add modal from the button', async (driver) => {
		const component = renderWithModals(driver, new PlayersStore({ seed: [] }));
		expect(accessibilityIds(component)).not.toContain('add-player-modal');

		elementById(component, 'players-add-btn')?.getAttribute('onTap')?.(touchEvent);

		expect(accessibilityIds(component)).toContain('add-player-modal');
	});

	valdiIt('puts a paired player into the list', async (driver) => {
		const store = new PlayersStore({
			createClient: () => ({
				hello: () =>
					Promise.resolve({
						headers: {},
						json: {
							apiVersions: [1],
							id: '0123456789abcdef',
							name: 'Kitchen',
							tier: 'tight',
							v: 1,
							version: '0.1.0',
						},
						status: 200,
					}) as ReturnType<PlayerClientPort['hello']>,
				mediaServer: () =>
					Promise.resolve<PlayerAnswer<unknown>>({
						headers: {},
						json: { version: 2 },
						status: 200,
					}) as ReturnType<PlayerClientPort['mediaServer']>,
				pair: () =>
					Promise.resolve({
						headers: {},
						json: { token: 'a'.repeat(64) },
						status: 200,
					}) as ReturnType<PlayerClientPort['pair']>,
				state: () =>
					Promise.resolve<PlayerAnswer<unknown>>({
						headers: {},
						json: { sourceHealth: { mediaServerUsers: [] } },
						status: 200,
					}) as ReturnType<PlayerClientPort['state']>,
			}),
			seed: [],
		});
		const component = renderWithModals(driver, store);

		elementById(component, 'players-add-btn')?.getAttribute('onTap')?.(touchEvent);
		typeIntoModal(component, '192.168.1.42:45889');
		elementById(component, 'add-player-continue-btn')?.getAttribute('onTap')?.(touchEvent);
		await settle(component);

		typeIntoModal(component, '12345678');
		elementById(component, 'add-player-connect-btn')?.getAttribute('onTap')?.(touchEvent);
		await settle(component);

		expect(store.sections()[0].players.map((player) => player.id)).toEqual([
			'this-device',
			'0123456789abcdef',
		]);
		expect(accessibilityIds(component)).not.toContain('add-player-modal');
	});

	valdiIt('says so when a player already serves another media server', async (driver) => {
		const { shown, toastService } = recordToasts();
		const { store } = provisioningStore({ push: 409 });
		await store.pair(KITCHEN, '12345678');

		await settle(render(driver, store, makePreferences(), toastService));

		expect(shown).toEqual([Strings.playersProvisionOtherServer('Kitchen')]);
	});

	valdiIt('says so when a player is no longer at that address', async (driver) => {
		const { shown, toastService } = recordToasts();
		const { asked, store } = provisioningStore({ moved: true });
		await store.pair(KITCHEN, '12345678');

		await settle(render(driver, store, makePreferences(), toastService));

		expect(shown).toEqual([Strings.playersProvisionMoved('Kitchen')]);
		expect(asked).toEqual([]);
	});

	valdiIt('stays quiet when a player cannot be reached', async (driver) => {
		const { shown, toastService } = recordToasts();
		const { store } = provisioningStore({ unreachable: true });
		await store.pair(KITCHEN, '12345678');

		await settle(render(driver, store, makePreferences(), toastService));

		expect(shown).toEqual([]);
	});

	valdiIt('interrupts once however many players are refused', async (driver) => {
		const { shown, toastService } = recordToasts();
		const { store } = provisioningStore({ push: 409 });
		await store.pair(KITCHEN, '12345678');
		await store.pair(STUDY, '12345678');

		await settle(render(driver, store, makePreferences(), toastService));

		expect(shown.length).toBe(1);
	});

	// The shell hides inactive tabs with style rather than unmounting them, so onCreate fires once
	// per launch and cannot be the trigger on its own.
	valdiIt('provisions when the tab becomes the active one', async () => {
		const { asked, store } = provisioningStore({});
		await store.pair(KITCHEN, '12345678');
		const instrumented = InstrumentedComponentJSX.create(
			PlayersView,
			playersViewModel(store, { active: false }),
			undefined,
		);
		await settle(instrumented.getComponent());
		expect(asked).toEqual([]);

		instrumented.setViewModel(playersViewModel(store, { active: true }));
		await settle(instrumented.getComponent());

		expect(asked).toEqual([KITCHEN.baseUrl]);
	});

	valdiIt('does not provision again while the tab stays active', async () => {
		const { asked, store } = provisioningStore({});
		await store.pair(KITCHEN, '12345678');
		const instrumented = InstrumentedComponentJSX.create(
			PlayersView,
			playersViewModel(store, { active: true }),
			undefined,
		);
		await settle(instrumented.getComponent());

		instrumented.setViewModel(playersViewModel(store, { active: true }));
		await settle(instrumented.getComponent());

		expect(asked).toEqual([KITCHEN.baseUrl]);
	});

	valdiIt('watches speaker status only while the tab is active', async () => {
		const store = new PlayersStore({ seed: [] });
		const stop = jasmine.createSpy('stop');
		const watch = spyOn(store, 'watchStatus').and.returnValue(stop);
		const instrumented = InstrumentedComponentJSX.create(
			PlayersView,
			playersViewModel(store, { active: false }),
			undefined,
		);
		expect(watch).not.toHaveBeenCalled();

		instrumented.setViewModel(playersViewModel(store, { active: true }));
		expect(watch).toHaveBeenCalledTimes(1);

		instrumented.setViewModel(playersViewModel(store, { active: false }));
		expect(stop).toHaveBeenCalledTimes(1);

		instrumented.destroy();
	});

	valdiIt('stops watching speaker status when the view goes away', async () => {
		const store = new PlayersStore({ seed: [] });
		const stop = jasmine.createSpy('stop');
		spyOn(store, 'watchStatus').and.returnValue(stop);
		const instrumented = InstrumentedComponentJSX.create(
			PlayersView,
			playersViewModel(store, { active: true }),
			undefined,
		);

		instrumented.destroy();

		expect(stop).toHaveBeenCalledTimes(1);
	});

	valdiIt('keeps going through the rest after one player is refused', async (driver) => {
		const { asked, store } = provisioningStore({ push: 409 });
		await store.pair(KITCHEN, '12345678');
		await store.pair(STUDY, '12345678');

		await settle(render(driver, store));

		expect(asked).toEqual([KITCHEN.baseUrl, STUDY.baseUrl]);
	});

	valdiIt('never asks this phone whether it holds a credential', async (driver) => {
		const { asked, store } = provisioningStore({});
		await store.pair(KITCHEN, '12345678');

		await settle(render(driver, store));

		expect(asked).toEqual([KITCHEN.baseUrl]);
	});

	valdiIt('moves a player through the store when a card is dropped', async (driver) => {
		const store = new PlayersStore({
			seed: [makePlayer('a'), makePlayer('b'), makePlayer('c')],
		});
		const component = render(driver, store);
		await driver.performLayout({ height: 800, width: 320 });

		const rowHeight = cardRowHeight(component);
		expect(rowHeight).toBeGreaterThan(0);
		// the test runtime reports iOS, so the card arms on a handle long-press and the drag is
		// read off the handle's touch stream
		const handle = elementById(component, 'player-card-a-drag');
		expect(handle).toBeDefined();
		const originY = 200;
		handle?.getAttribute('onLongPress')?.(touchEventWith({ absoluteY: originY, state: 0 }));
		handle?.getAttribute('onTouch')?.(
			touchEventWith({ absoluteY: originY + rowHeight * 2, state: 1 }),
		);
		handle?.getAttribute('onTouch')?.(
			touchEventWith({ absoluteY: originY + rowHeight * 2, state: 2 }),
		);

		expect(store.sections()[0].players.map((player) => player.id)).toEqual([
			'this-device',
			'b',
			'c',
			'a',
		]);
	});

	valdiIt('gives a lone player no drag handle', async (driver) => {
		const component = render(driver, new PlayersStore({ seed: [makePlayer('a')] }));

		expect(accessibilityIds(component)).not.toContain('player-card-a-drag');
	});

	valdiIt('gives every card a drag handle once there is more than one', async (driver) => {
		const component = render(
			driver,
			new PlayersStore({ seed: [makePlayer('a'), makePlayer('b')] }),
		);

		expect(accessibilityIds(component)).toContain('player-card-a-drag');
		expect(accessibilityIds(component)).toContain('player-card-b-drag');
	});

	valdiIt('redraws the card once the store reports the change', async (driver) => {
		const store = new PlayersStore({ seed: [makePlayer('a', { enabled: false })] });
		const component = render(driver, store);
		expect(accessibilityIds(component)).not.toContain('player-card-a-status-dot');

		elementById(component, 'player-card-a-toggle')?.getAttribute('onTap')?.(touchEvent);

		expect(accessibilityIds(component)).toContain('player-card-a-status-dot');
	});

	valdiIt('opens the forget modal from a long press', async (driver) => {
		jasmine.clock().install();
		try {
			const component = renderWithModals(driver, new PlayersStore({ seed: [makePlayer('a')] }));
			expect(accessibilityIds(component)).not.toContain('players-forget-confirm-btn');

			holdCard(component, 'a');

			expect(accessibilityIds(component)).toContain('players-forget-confirm-btn');
		} finally {
			jasmine.clock().uninstall();
		}
	});

	valdiIt('forgets the player once the modal is confirmed', async (driver) => {
		jasmine.clock().install();
		try {
			const store = new PlayersStore({ seed: [makePlayer('a'), makePlayer('b')] });
			const component = renderWithModals(driver, store);

			holdCard(component, 'a');
			elementById(component, 'players-forget-confirm-btn')?.getAttribute('onTap')?.(touchEvent);

			expect(store.sections()[0].players.map((player) => player.id)).toEqual(['this-device', 'b']);
			expect(accessibilityIds(component)).not.toContain('players-forget-confirm-btn');
		} finally {
			jasmine.clock().uninstall();
		}
	});

	valdiIt('keeps the player when the modal is cancelled', async (driver) => {
		jasmine.clock().install();
		try {
			const store = new PlayersStore({ seed: [makePlayer('a'), makePlayer('b')] });
			const component = renderWithModals(driver, store);

			holdCard(component, 'a');
			elementById(component, 'players-forget-cancel-btn')?.getAttribute('onTap')?.(touchEvent);

			expect(store.sections()[0].players.map((player) => player.id)).toEqual([
				'this-device',
				'a',
				'b',
			]);
			expect(accessibilityIds(component)).not.toContain('players-forget-confirm-btn');
		} finally {
			jasmine.clock().uninstall();
		}
	});

	valdiIt('leaves this device out of the reorderable list', async (driver) => {
		const component = render(driver, new PlayersStore({ seed: [makePlayer('a')] }));

		expect(accessibilityIds(component)).toContain('player-card-this-device');
		expect(accessibilityIds(component)).not.toContain('player-card-this-device-drag');
		expect(accessibilityIds(component)).not.toContain(
			'reorderable-row-player-default-this-device-0',
		);
	});

	valdiIt('will not long press this device', async (driver) => {
		jasmine.clock().install();
		try {
			const component = renderWithModals(driver, new PlayersStore({ seed: [] }));

			holdCard(component, 'this-device');

			expect(accessibilityIds(component)).not.toContain('players-forget-confirm-btn');
		} finally {
			jasmine.clock().uninstall();
		}
	});

	valdiIt('moves the right player when this device shares the list', async (driver) => {
		const store = new PlayersStore({
			seed: [makePlayer('a'), makePlayer('b'), makePlayer('c')],
		});
		const component = render(driver, store);
		await driver.performLayout({ height: 800, width: 320 });

		const rowHeight = cardRowHeight(component);
		expect(rowHeight).toBeGreaterThan(0);
		const handle = elementById(component, 'player-card-a-drag');
		expect(handle).toBeDefined();
		const originY = 200;
		handle?.getAttribute('onLongPress')?.(touchEventWith({ absoluteY: originY, state: 0 }));
		handle?.getAttribute('onTouch')?.(
			touchEventWith({ absoluteY: originY + rowHeight * 2, state: 1 }),
		);
		handle?.getAttribute('onTouch')?.(
			touchEventWith({ absoluteY: originY + rowHeight * 2, state: 2 }),
		);

		expect(store.sections()[0].players.map((player) => player.id)).toEqual([
			'this-device',
			'b',
			'c',
			'a',
		]);
	});
});

type RenderedComponent = Parameters<typeof componentGetElements>[0];

function isEnabled(store: PlayersStore, id: string): boolean | undefined {
	return store
		.sections()
		.flatMap((section) => section.players)
		.find((player) => player.id === id)?.enabled;
}

async function settle(component: Parameters<typeof untilRenderComplete>[0]): Promise<void> {
	await new Promise<void>((resolve) => {
		setTimeout(resolve, 0);
	});
	await untilRenderComplete(component);
}

function typeIntoModal(component: RenderedComponent, text: string): void {
	elementTypeFind(
		componentGetElements(component),
		IRenderedElementViewClass.TextField,
	)[0]?.getAttribute('onChange')?.(editTextEvent(text));
}

function accessibilityIds(component: RenderedComponent): Array<string> {
	return elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View)
		.map((view) => view.getAttribute('accessibilityId'))
		.filter((id): id is string => typeof id === 'string');
}

function cardRowHeight(component: RenderedComponent): number {
	const first = elementById(component, 'reorderable-row-player-default-a-0')?.frame?.y ?? 0;
	const second = elementById(component, 'reorderable-row-player-default-b-1')?.frame?.y ?? 0;
	return second - first;
}

function elementById(component: RenderedComponent, id: string): IRenderedElement | undefined {
	return elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View).find(
		(element) => element.getAttribute('accessibilityId') === id,
	);
}

function holdCard(component: RenderedComponent, id: string): void {
	elementById(component, `player-card-${id}`)?.getAttribute('onTouch')?.(
		touchEventWith({ state: 0 }),
	);
	jasmine.clock().tick(500);
}

function labelValues(component: RenderedComponent): Array<unknown> {
	return elementTypeFind(componentGetElements(component), IRenderedElementViewClass.Label).map(
		(label) => label.getAttribute('value'),
	);
}

function makePlayer(id: string, overrides: Partial<Player> = {}): Player {
	return {
		baseUrl: 'http://192.168.1.42:45889',
		enabled: true,
		group: DEFAULT_PLAYER_GROUP,
		icon: null,
		id,
		isThisDevice: false,
		lastError: null,
		name: `Player ${id}`,
		reachable: true,
		state: PlayerStates.idle,
		tier: PlayerTiers.tight,
		...overrides,
	};
}

function provisioningStore(options: { moved?: boolean; push?: number; unreachable?: boolean }) {
	const asked: Array<string> = [];

	const store = new PlayersStore({
		createClient: (baseUrl) => ({
			hello: () => {
				const player = PAIRABLE.find((candidate) => candidate.baseUrl === baseUrl);

				return Promise.resolve<PlayerAnswer<unknown>>({
					headers: {},
					json: {
						apiVersions: [1],
						id: options.moved ? 'somebody-else' : (player?.id ?? ''),
						name: player?.name ?? '',
						tier: 'tight',
						v: 1,
						version: '0.1.0',
					},
					status: 200,
				}) as ReturnType<PlayerClientPort['hello']>;
			},
			mediaServer: () =>
				Promise.resolve<PlayerAnswer<unknown>>({
					headers: {},
					json:
						options.push === undefined
							? { version: 2 }
							: { code: 'media_server_id_mismatch', status: options.push, title: 'x' },
					status: options.push ?? 200,
				}) as ReturnType<PlayerClientPort['mediaServer']>,
			pair: () =>
				Promise.resolve({
					headers: {},
					json: { token: 'a'.repeat(64) },
					status: 200,
				}) as ReturnType<PlayerClientPort['pair']>,
			state: () => {
				asked.push(baseUrl);

				return (
					options.unreachable
						? Promise.reject(new Error('no route'))
						: Promise.resolve<PlayerAnswer<unknown>>({
								headers: {},
								json: { sourceHealth: { mediaServerUsers: [] } },
								status: 200,
							})
				) as ReturnType<PlayerClientPort['state']>;
			},
		}),
		provisioning: {
			mint: (player) =>
				Promise.resolve({
					accessToken: 'player-token',
					baseUrl: 'https://demo.jellyfin.local',
					deviceId: `atolla-${player.id}-user-1`,
					serverId: 'server-1',
					userId: 'user-1',
				}),
			userId: () => 'user-1',
		},
		seed: [],
	});

	return { asked, store };
}

function recordToasts() {
	const toastService = new ToastService();
	const shown: Array<string> = [];

	toastService.subscribe(() => {
		const message = toastService.getCurrent()?.model.message;
		if (message !== undefined) {
			shown.push(message);
		}
	});

	return { shown, toastService };
}

function makePreferences(): Preferences {
	return new Preferences({ fetchString: async () => '', storeString: async () => {} });
}

function playersViewModel(
	playersStore: PlayersStore,
	overrides: Partial<PlayersViewModel> = {},
): PlayersViewModel {
	return {
		active: true,
		language: 'en',
		modalSlot: new DetachedSlot(),
		playersStore,
		preferences: makePreferences(),
		toastService: new ToastService(),
		...overrides,
	};
}

function render(
	driver: IComponentTestDriver,
	playersStore: PlayersStore,
	preferences: Preferences = makePreferences(),
	toastService: ToastService = new ToastService(),
) {
	return driver.renderComponent(
		PlayersView,
		playersViewModel(playersStore, { preferences, toastService }),
		undefined,
	);
}

function renderWithModals(
	driver: IComponentTestDriver,
	playersStore: PlayersStore,
	preferences: Preferences = makePreferences(),
) {
	return driver.renderComponent(
		PlayersViewHost,
		{ playersStore, preferences, toastService: new ToastService() },
		undefined,
	);
}
