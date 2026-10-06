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
import type { ReorderableRowHandle } from 'atolla_app/src/ui/components/ReorderableList';
import { componentGetElements } from 'foundation/test/util/componentGetElements';
import { elementTypeFind } from 'foundation/test/util/elementTypeFind';
import { ElementRef } from 'valdi_core/src/ElementRef';
import type { IRenderedElement } from 'valdi_core/src/IRenderedElement';
import { IRenderedElementViewClass } from 'valdi_test/test/IRenderedElementViewClass';
import type { IComponentTestDriver } from 'valdi_test/test/JSXTestUtils';
import { valdiIt } from 'valdi_test/test/JSXTestUtils';
import type { TouchEvent } from 'valdi_tsx/src/GestureEvents';
import { styleAttribute, touchEvent, touchEventWith } from '../util/testEvents';

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

	valdiIt('shows playing while the player plays', async (driver) => {
		const component = driver.renderComponent(
			PlayerCard,
			{ onToggle: () => {}, player: makePlayer({ state: PlayerStates.playing }) },
			undefined,
		);

		expect(labelValues(component)).toContain(Strings.playersStatusPlaying());
	});

	valdiIt('shows paused while the player holds a paused queue', async (driver) => {
		const component = driver.renderComponent(
			PlayerCard,
			{ onToggle: () => {}, player: makePlayer({ state: PlayerStates.paused }) },
			undefined,
		);

		expect(labelValues(component)).toContain(Strings.playersStatusPaused());
	});

	valdiIt('prefers unreachable over the last state it reported', async (driver) => {
		const component = driver.renderComponent(
			PlayerCard,
			{
				onToggle: () => {},
				player: makePlayer({ reachable: false, state: PlayerStates.playing }),
			},
			undefined,
		);

		expect(labelValues(component)).not.toContain(Strings.playersStatusPlaying());
	});

	valdiIt('shows the address of a networked player without its scheme', async (driver) => {
		const component = driver.renderComponent(
			PlayerCard,
			{ onToggle: () => {}, player: makePlayer({ baseUrl: 'http://192.168.1.42:45889' }) },
			undefined,
		);

		expect(labelValues(component)).toContain('192.168.1.42:45889');
	});

	valdiIt('names this device instead of showing an address', async (driver) => {
		const component = driver.renderComponent(
			PlayerCard,
			{ onToggle: () => {}, player: makePlayer({ baseUrl: null, isThisDevice: true }) },
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
		expect(labelValues(component)).toContain('192.168.1.42:45889');
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

	valdiIt('shows no drag handle when the card is not reorderable', async (driver) => {
		const component = driver.renderComponent(
			PlayerCard,
			{ onToggle: () => {}, player: makePlayer() },
			undefined,
		);

		expect(elementById(component, 'player-card-kitchen-drag')).toBe(undefined);
	});

	valdiIt('wires the drag handle it is given', async (driver) => {
		let touches = 0;
		const component = driver.renderComponent(
			PlayerCard,
			{
				dragHandle: makeHandle(() => {
					touches += 1;
				}),
				onToggle: () => {},
				player: makePlayer(),
			},
			undefined,
		);

		const handle = elementById(component, 'player-card-kitchen-drag');
		handle?.getAttribute('onTouch')?.(touchEventWith({ state: 1 }));

		expect(handle).toBeDefined();
		expect(touches).toBe(1);
	});

	valdiIt('calls onLongPress once the press is held', async (driver) => {
		jasmine.clock().install();
		try {
			let pressed = 0;
			const component = renderWithLongPress(driver, () => {
				pressed += 1;
			});

			card(component)?.getAttribute('onTouch')?.(touchEventWith({ state: 0 }));
			jasmine.clock().tick(500);

			expect(pressed).toBe(1);
		} finally {
			jasmine.clock().uninstall();
		}
	});

	valdiIt('does not call onLongPress when the press is released early', async (driver) => {
		jasmine.clock().install();
		try {
			let pressed = 0;
			const component = renderWithLongPress(driver, () => {
				pressed += 1;
			});

			card(component)?.getAttribute('onTouch')?.(touchEventWith({ state: 0 }));
			jasmine.clock().tick(200);
			card(component)?.getAttribute('onTouch')?.(touchEventWith({ state: 2 }));
			jasmine.clock().tick(500);

			expect(pressed).toBe(0);
		} finally {
			jasmine.clock().uninstall();
		}
	});

	valdiIt('abandons the long press once the finger moves', async (driver) => {
		jasmine.clock().install();
		try {
			let pressed = 0;
			const component = renderWithLongPress(driver, () => {
				pressed += 1;
			});

			card(component)?.getAttribute('onTouch')?.(touchEventWith({ state: 0 }));
			jasmine.clock().tick(200);
			card(component)?.getAttribute('onTouch')?.(
				touchEventWith({ deltaX: 0, deltaY: 40, state: 1 }),
			);
			jasmine.clock().tick(500);

			expect(pressed).toBe(0);
		} finally {
			jasmine.clock().uninstall();
		}
	});

	valdiIt('abandons the long press when the drag handle is touched', async (driver) => {
		jasmine.clock().install();
		try {
			let pressed = 0;
			const component = driver.renderComponent(
				PlayerCard,
				{
					dragHandle: makeHandle(() => {}),
					onLongPress: () => {
						pressed += 1;
					},
					onToggle: () => {},
					player: makePlayer(),
				},
				undefined,
			);

			card(component)?.getAttribute('onTouch')?.(touchEventWith({ state: 0 }));
			jasmine.clock().tick(200);
			elementById(component, 'player-card-kitchen-drag')?.getAttribute('onTouch')?.(
				touchEventWith({ state: 0 }),
			);
			jasmine.clock().tick(500);

			expect(pressed).toBe(0);
		} finally {
			jasmine.clock().uninstall();
		}
	});

	valdiIt('listens for no touches when nothing wants a long press', async (driver) => {
		const component = driver.renderComponent(
			PlayerCard,
			{ onToggle: () => {}, player: makePlayer() },
			undefined,
		);

		expect(card(component)?.getAttribute('onTouch')).toBe(undefined);
	});
});

type RenderedComponent = Parameters<typeof componentGetElements>[0];

function card(component: RenderedComponent): IRenderedElement | undefined {
	return elementById(component, 'player-card-kitchen');
}

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

function makeHandle(onTouch: (event: TouchEvent) => void): ReorderableRowHandle {
	return {
		longPressDuration: 0.1,
		onLongPress: undefined,
		onLongPressDisabled: true,
		onTouch,
		ref: new ElementRef(),
	};
}

function renderWithLongPress(driver: IComponentTestDriver, onLongPress: () => void) {
	return driver.renderComponent(
		PlayerCard,
		{ onLongPress, onToggle: () => {}, player: makePlayer() },
		undefined,
	);
}

function makePlayer(overrides: Partial<Player> = {}): Player {
	return {
		baseUrl: 'http://192.168.1.42:45889',
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
