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
import { IRenderedElementViewClass } from 'valdi_test/test/IRenderedElementViewClass';
import type { IComponentTestDriver } from 'valdi_test/test/JSXTestUtils';
import { valdiIt } from 'valdi_test/test/JSXTestUtils';

describe('PlayersView', () => {
	valdiIt('says there are no players when the store is empty', async (driver) => {
		const component = render(driver, new PlayersStore([], 0));

		expect(labelValues(component)).toContain(Strings.playersEmpty());
	});

	valdiIt('renders a card per player', async (driver) => {
		const store = new PlayersStore([makePlayer('a'), makePlayer('b')], 0);

		const component = render(driver, store);

		expect(accessibilityIds(component)).toContain('player-card-a');
		expect(accessibilityIds(component)).toContain('player-card-b');
		expect(accessibilityIds(component)).not.toContain('players-empty');
	});

	valdiIt('hides the group header while everything is in one group', async (driver) => {
		const store = new PlayersStore([makePlayer('a'), makePlayer('b')], 0);

		const component = render(driver, store);

		expect(accessibilityIds(component)).not.toContain(`players-group-${DEFAULT_PLAYER_GROUP}`);
	});

	valdiIt('shows a group header once there is more than one group', async (driver) => {
		const store = new PlayersStore([makePlayer('a'), makePlayer('b', { group: 'upstairs' })], 0);

		const component = render(driver, store);

		expect(accessibilityIds(component)).toContain(`players-group-${DEFAULT_PLAYER_GROUP}`);
		expect(accessibilityIds(component)).toContain('players-group-upstairs');
	});

	valdiIt('titles this device with the configured device name', async (driver) => {
		const store = new PlayersStore([makePlayer('a', { isThisDevice: true })], 0);
		const preferences = makePreferences();
		void preferences.setJellyfinClientDeviceName('Pocket Radio');

		const component = render(driver, store, preferences);

		expect(labelValues(component)).toContain('Pocket Radio');
		expect(labelValues(component)).not.toContain('Player a');
	});

	valdiIt('keeps a player name when the device name is unset', async (driver) => {
		const store = new PlayersStore([makePlayer('a', { isThisDevice: true })], 0);

		const component = render(driver, store);

		expect(labelValues(component)).toContain('Player a');
	});
});

type RenderedComponent = Parameters<typeof componentGetElements>[0];

function accessibilityIds(component: RenderedComponent): Array<string> {
	return elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View)
		.map((view) => view.getAttribute('accessibilityId'))
		.filter((id): id is string => typeof id === 'string');
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
		{ language: 'en', playersStore, preferences },
		undefined,
	);
}
