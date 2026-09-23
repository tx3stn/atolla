import 'jasmine/src/jasmine';
import {
	DEFAULT_PLAYER_GROUP,
	type Player,
	PlayerStates,
	PlayerTiers,
} from 'atolla_app/src/models/Player';
import Strings from 'atolla_app/src/Strings';
import { theme } from 'atolla_app/src/theme';
import { PlayerCard } from 'atolla_app/src/ui/components/PlayerCard';
import { componentGetElements } from 'foundation/test/util/componentGetElements';
import { elementTypeFind } from 'foundation/test/util/elementTypeFind';
import type { IRenderedElement } from 'valdi_core/src/IRenderedElement';
import { IRenderedElementViewClass } from 'valdi_test/test/IRenderedElementViewClass';
import { valdiIt } from 'valdi_test/test/JSXTestUtils';
import { styleAttribute, touchEvent } from '../util/testEvents';

describe('PlayerCard', () => {
	valdiIt('shows the error when the player reports one', async (driver) => {
		const component = driver.renderComponent(
			PlayerCard,
			{ onToggle: () => {}, player: makePlayer({ lastError: 'could not reach the media server' }) },
			undefined,
		);

		expect(labelValues(component)).toContain('could not reach the media server');
		expect(labelValues(component)).not.toContain(Strings.playersStatusConnected());
	});

	valdiIt('shows unreachable when the player did not answer', async (driver) => {
		const component = driver.renderComponent(
			PlayerCard,
			{ onToggle: () => {}, player: makePlayer({ reachable: false }) },
			undefined,
		);

		expect(labelValues(component)).toContain(Strings.playersStatusUnreachable());
	});

	valdiIt('prefers the error over unreachable', async (driver) => {
		const component = driver.renderComponent(
			PlayerCard,
			{ onToggle: () => {}, player: makePlayer({ lastError: 'boom', reachable: false }) },
			undefined,
		);

		expect(labelValues(component)).toContain('boom');
		expect(labelValues(component)).not.toContain(Strings.playersStatusUnreachable());
	});

	valdiIt('shows connected when nothing is wrong', async (driver) => {
		const component = driver.renderComponent(
			PlayerCard,
			{ onToggle: () => {}, player: makePlayer() },
			undefined,
		);

		expect(labelValues(component)).toContain(Strings.playersStatusConnected());
	});

	valdiIt('shows the address of a networked player', async (driver) => {
		const component = driver.renderComponent(
			PlayerCard,
			{ onToggle: () => {}, player: makePlayer({ address: '192.168.1.42' }) },
			undefined,
		);

		expect(labelValues(component)).toContain('192.168.1.42');
	});

	valdiIt('names this device instead of showing an address', async (driver) => {
		const component = driver.renderComponent(
			PlayerCard,
			{ onToggle: () => {}, player: makePlayer({ address: null, isThisDevice: true }) },
			undefined,
		);

		expect(labelValues(component)).toContain(Strings.playersThisDevice());
	});

	valdiIt('forwards a toggle with the value the switch moved to', async (driver) => {
		let received: boolean | undefined;
		const component = driver.renderComponent(
			PlayerCard,
			{
				onToggle: (enabled: boolean) => {
					received = enabled;
				},
				player: makePlayer({ enabled: false }),
			},
			undefined,
		);

		elementById(component, 'player-card-kitchen-toggle')?.getAttribute('onTap')?.(touchEvent);

		expect(received).toBe(true);
	});

	valdiIt('marks a healthy player with the success dot', async (driver) => {
		const component = driver.renderComponent(
			PlayerCard,
			{ onToggle: () => {}, player: makePlayer() },
			undefined,
		);

		expect(dotColor(component)).toBe(theme.colors.success);
	});

	valdiIt('marks an errored player with the destructive dot', async (driver) => {
		const component = driver.renderComponent(
			PlayerCard,
			{ onToggle: () => {}, player: makePlayer({ lastError: 'boom' }) },
			undefined,
		);

		expect(dotColor(component)).toBe(theme.colors.destructive);
	});

	valdiIt('marks an unreachable player with the destructive dot', async (driver) => {
		const component = driver.renderComponent(
			PlayerCard,
			{ onToggle: () => {}, player: makePlayer({ reachable: false }) },
			undefined,
		);

		expect(dotColor(component)).toBe(theme.colors.destructive);
	});

	valdiIt('says nothing about state while the player is switched off', async (driver) => {
		const component = driver.renderComponent(
			PlayerCard,
			{ onToggle: () => {}, player: makePlayer({ enabled: false }) },
			undefined,
		);

		expect(elementById(component, 'player-card-kitchen-status-dot')).toBe(undefined);
		expect(labelValues(component)).not.toContain(Strings.playersStatusConnected());
	});

	valdiIt('still names a switched-off player and gives its address', async (driver) => {
		const component = driver.renderComponent(
			PlayerCard,
			{ onToggle: () => {}, player: makePlayer({ enabled: false }) },
			undefined,
		);

		expect(labelValues(component)).toContain('Kitchen');
		expect(labelValues(component)).toContain('192.168.1.42');
	});

	valdiIt('stays silent about state when a switched-off player is unreachable', async (driver) => {
		const component = driver.renderComponent(
			PlayerCard,
			{ onToggle: () => {}, player: makePlayer({ enabled: false, reachable: false }) },
			undefined,
		);

		expect(elementById(component, 'player-card-kitchen-status-dot')).toBe(undefined);
		expect(labelValues(component)).not.toContain(Strings.playersStatusUnreachable());
	});
});

type RenderedComponent = Parameters<typeof componentGetElements>[0];

function dotColor(component: RenderedComponent): unknown {
	return styleAttribute(
		elementById(component, 'player-card-kitchen-status-dot'),
		'backgroundColor',
	);
}

function elementById(component: RenderedComponent, id: string): IRenderedElement | undefined {
	return elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View).find(
		(element) => element.getAttribute('accessibilityId') === id,
	);
}

function labelValues(component: RenderedComponent): Array<unknown> {
	return elementTypeFind(componentGetElements(component), IRenderedElementViewClass.Label).map(
		(label) => label.getAttribute('value'),
	);
}

function makePlayer(overrides: Partial<Player> = {}): Player {
	return {
		address: '192.168.1.42',
		enabled: true,
		group: DEFAULT_PLAYER_GROUP,
		icon: null,
		id: 'kitchen',
		isThisDevice: false,
		lastError: null,
		name: 'Kitchen',
		reachable: true,
		state: PlayerStates.idle,
		tier: PlayerTiers.tight,
		...overrides,
	};
}
