import 'jasmine/src/jasmine';
import {
	DEFAULT_PLAYER_GROUP,
	type Player,
	PlayerStates,
	PlayerTiers,
} from 'atolla_app/src/models/Player';
import Strings from 'atolla_app/src/Strings';
import { PlayersStore } from 'atolla_app/src/stores/Players';
import { Preferences } from 'atolla_app/src/stores/Preferences';
import { PlayersView } from 'atolla_app/src/ui/views/PlayersView';
import { componentGetElements } from 'foundation/test/util/componentGetElements';
import { elementTypeFind } from 'foundation/test/util/elementTypeFind';
import { untilRenderComplete } from 'foundation/test/util/untilRenderComplete';
import { Component } from 'valdi_core/src/Component';
import type { IRenderedElement } from 'valdi_core/src/IRenderedElement';
import { DetachedSlot } from 'valdi_core/src/slot/DetachedSlot';
import { DetachedSlotRenderer } from 'valdi_core/src/slot/DetachedSlotRenderer';
import { IRenderedElementViewClass } from 'valdi_test/test/IRenderedElementViewClass';
import type { IComponentTestDriver } from 'valdi_test/test/JSXTestUtils';
import { valdiIt } from 'valdi_test/test/JSXTestUtils';
import { editTextEvent, touchEvent, touchEventWith } from '../util/testEvents';

interface PlayersViewHostViewModel {
	playersStore: PlayersStore;
	preferences: Preferences;
}

class PlayersViewHost extends Component<PlayersViewHostViewModel> {
	private slot = new DetachedSlot();

	onRender(): void {
		<view>
			<PlayersView
				language='en'
				modalSlot={this.slot}
				playersStore={this.viewModel.playersStore}
				preferences={this.viewModel.preferences}
			/>
			<DetachedSlotRenderer detachedSlot={this.slot} />
		</view>;
	}
}

describe('PlayersView', () => {
	valdiIt('says there are no players when the store is empty', async (driver) => {
		const component = render(driver, new PlayersStore({ pairDelayMs: 0, seed: [] }));

		expect(labelValues(component)).toContain(Strings.playersEmpty());
	});

	valdiIt('renders a card per player', async (driver) => {
		const store = new PlayersStore({ pairDelayMs: 0, seed: [makePlayer('a'), makePlayer('b')] });

		const component = render(driver, store);

		expect(accessibilityIds(component)).toContain('player-card-a');
		expect(accessibilityIds(component)).toContain('player-card-b');
		expect(accessibilityIds(component)).not.toContain('players-empty');
	});

	valdiIt('hides the group header while everything is in one group', async (driver) => {
		const store = new PlayersStore({ pairDelayMs: 0, seed: [makePlayer('a'), makePlayer('b')] });

		const component = render(driver, store);

		expect(accessibilityIds(component)).not.toContain(`players-group-${DEFAULT_PLAYER_GROUP}`);
	});

	valdiIt('shows a group header once there is more than one group', async (driver) => {
		const store = new PlayersStore({
			pairDelayMs: 0,
			seed: [makePlayer('a'), makePlayer('b', { group: 'upstairs' })],
		});

		const component = render(driver, store);

		expect(accessibilityIds(component)).toContain(`players-group-${DEFAULT_PLAYER_GROUP}`);
		expect(accessibilityIds(component)).toContain('players-group-upstairs');
	});

	valdiIt('titles this device with the configured device name', async (driver) => {
		const store = new PlayersStore({
			pairDelayMs: 0,
			seed: [makePlayer('a', { isThisDevice: true })],
		});
		const preferences = makePreferences();
		void preferences.setJellyfinClientDeviceName('Pocket Radio');

		const component = render(driver, store, preferences);

		expect(labelValues(component)).toContain('Pocket Radio');
		expect(labelValues(component)).not.toContain('Player a');
	});

	valdiIt('keeps a player name when the device name is unset', async (driver) => {
		const store = new PlayersStore({
			pairDelayMs: 0,
			seed: [makePlayer('a', { isThisDevice: true })],
		});

		const component = render(driver, store);

		expect(labelValues(component)).toContain('Player a');
	});

	valdiIt('switches a player on through the store', async (driver) => {
		const store = new PlayersStore({ pairDelayMs: 0, seed: [makePlayer('a', { enabled: false })] });
		const component = render(driver, store);

		elementById(component, 'player-card-a-toggle')?.getAttribute('onTap')?.(touchEvent);

		expect(store.sections()[0].players[0].enabled).toBe(true);
	});

	valdiIt('switches a player off through the store', async (driver) => {
		const store = new PlayersStore({ pairDelayMs: 0, seed: [makePlayer('a', { enabled: true })] });
		const component = render(driver, store);

		elementById(component, 'player-card-a-toggle')?.getAttribute('onTap')?.(touchEvent);

		expect(store.sections()[0].players[0].enabled).toBe(false);
	});

	valdiIt('toggles only the player whose switch was tapped', async (driver) => {
		const store = new PlayersStore({ pairDelayMs: 0, seed: [makePlayer('a'), makePlayer('b')] });
		const component = render(driver, store);

		elementById(component, 'player-card-b-toggle')?.getAttribute('onTap')?.(touchEvent);

		expect(store.sections()[0].players[0].enabled).toBe(true);
		expect(store.sections()[0].players[1].enabled).toBe(false);
	});

	valdiIt('opens the add modal from the button', async (driver) => {
		const component = renderWithModals(driver, new PlayersStore({ pairDelayMs: 0, seed: [] }));
		expect(accessibilityIds(component)).not.toContain('add-player-modal');

		elementById(component, 'players-add-btn')?.getAttribute('onTap')?.(touchEvent);

		expect(accessibilityIds(component)).toContain('add-player-modal');
	});

	valdiIt('puts a paired player into the list', async (driver) => {
		const store = new PlayersStore({ pairDelayMs: 0, seed: [] });
		const component = renderWithModals(driver, store);

		elementById(component, 'players-add-btn')?.getAttribute('onTap')?.(touchEvent);
		elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.TextField,
		)[0]?.getAttribute('onChange')?.(editTextEvent('12345678'));
		elementById(component, 'add-player-connect-btn')?.getAttribute('onTap')?.(touchEvent);
		await new Promise<void>((resolve) => {
			setTimeout(resolve, 0);
		});
		await untilRenderComplete(component);

		expect(store.sections()[0].players.length).toBe(1);
		expect(accessibilityIds(component)).not.toContain('add-player-modal');
	});

	valdiIt('moves a player through the store when a card is dropped', async (driver) => {
		const store = new PlayersStore({
			pairDelayMs: 0,
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

		expect(store.sections()[0].players.map((player) => player.id)).toEqual(['b', 'c', 'a']);
	});

	valdiIt('gives a lone player no drag handle', async (driver) => {
		const component = render(driver, new PlayersStore({ pairDelayMs: 0, seed: [makePlayer('a')] }));

		expect(accessibilityIds(component)).not.toContain('player-card-a-drag');
	});

	valdiIt('gives every card a drag handle once there is more than one', async (driver) => {
		const component = render(
			driver,
			new PlayersStore({ pairDelayMs: 0, seed: [makePlayer('a'), makePlayer('b')] }),
		);

		expect(accessibilityIds(component)).toContain('player-card-a-drag');
		expect(accessibilityIds(component)).toContain('player-card-b-drag');
	});

	valdiIt('redraws the card once the store reports the change', async (driver) => {
		const store = new PlayersStore({ pairDelayMs: 0, seed: [makePlayer('a', { enabled: false })] });
		const component = render(driver, store);
		expect(accessibilityIds(component)).not.toContain('player-card-a-status-dot');

		elementById(component, 'player-card-a-toggle')?.getAttribute('onTap')?.(touchEvent);

		expect(accessibilityIds(component)).toContain('player-card-a-status-dot');
	});

	valdiIt('opens the forget modal from a long press', async (driver) => {
		jasmine.clock().install();
		try {
			const component = renderWithModals(
				driver,
				new PlayersStore({ pairDelayMs: 0, seed: [makePlayer('a')] }),
			);
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
			const store = new PlayersStore({ pairDelayMs: 0, seed: [makePlayer('a'), makePlayer('b')] });
			const component = renderWithModals(driver, store);

			holdCard(component, 'a');
			elementById(component, 'players-forget-confirm-btn')?.getAttribute('onTap')?.(touchEvent);

			expect(store.sections()[0].players.map((player) => player.id)).toEqual(['b']);
			expect(accessibilityIds(component)).not.toContain('players-forget-confirm-btn');
		} finally {
			jasmine.clock().uninstall();
		}
	});

	valdiIt('keeps the player when the modal is cancelled', async (driver) => {
		jasmine.clock().install();
		try {
			const store = new PlayersStore({ pairDelayMs: 0, seed: [makePlayer('a'), makePlayer('b')] });
			const component = renderWithModals(driver, store);

			holdCard(component, 'a');
			elementById(component, 'players-forget-cancel-btn')?.getAttribute('onTap')?.(touchEvent);

			expect(store.sections()[0].players.map((player) => player.id)).toEqual(['a', 'b']);
			expect(accessibilityIds(component)).not.toContain('players-forget-confirm-btn');
		} finally {
			jasmine.clock().uninstall();
		}
	});

	valdiIt('leaves this device out of the reorderable list', async (driver) => {
		const component = render(
			driver,
			new PlayersStore({
				pairDelayMs: 0,
				seed: [makePlayer('a'), makePlayer('device', { isThisDevice: true })],
			}),
		);

		expect(accessibilityIds(component)).toContain('player-card-device');
		expect(accessibilityIds(component)).not.toContain('player-card-device-drag');
		expect(accessibilityIds(component)).not.toContain('reorderable-row-player-default-device-0');
	});

	valdiIt('will not long press this device', async (driver) => {
		jasmine.clock().install();
		try {
			const component = renderWithModals(
				driver,
				new PlayersStore({
					pairDelayMs: 0,
					seed: [makePlayer('device', { isThisDevice: true })],
				}),
			);

			holdCard(component, 'device');

			expect(accessibilityIds(component)).not.toContain('players-forget-confirm-btn');
		} finally {
			jasmine.clock().uninstall();
		}
	});

	valdiIt('moves the right player when this device shares the list', async (driver) => {
		const store = new PlayersStore({
			pairDelayMs: 0,
			seed: [
				makePlayer('device', { isThisDevice: true }),
				makePlayer('a'),
				makePlayer('b'),
				makePlayer('c'),
			],
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
			'device',
			'b',
			'c',
			'a',
		]);
	});
});

type RenderedComponent = Parameters<typeof componentGetElements>[0];

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
		address: '192.168.1.42',
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

function makePreferences(): Preferences {
	return new Preferences({ fetchString: async () => '', storeString: async () => {} });
}

function render(
	driver: IComponentTestDriver,
	playersStore: PlayersStore,
	preferences: Preferences = makePreferences(),
) {
	return driver.renderComponent(
		PlayersView,
		{ language: 'en', modalSlot: new DetachedSlot(), playersStore, preferences },
		undefined,
	);
}

function renderWithModals(
	driver: IComponentTestDriver,
	playersStore: PlayersStore,
	preferences: Preferences = makePreferences(),
) {
	return driver.renderComponent(PlayersViewHost, { playersStore, preferences }, undefined);
}
