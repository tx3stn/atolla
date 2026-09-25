import 'jasmine/src/jasmine';
import type { ProbedPlayer } from 'atolla_app/src/models/Player';
import Strings from 'atolla_app/src/Strings';
import { PlayerErrors } from 'atolla_app/src/services/PlayerErrors';
import {
	AddPlayerModal,
	type AddPlayerModalViewModel,
} from 'atolla_app/src/ui/modals/AddPlayerModal';
import { componentGetElements } from 'foundation/test/util/componentGetElements';
import { elementTypeFind } from 'foundation/test/util/elementTypeFind';
import { untilRenderComplete } from 'foundation/test/util/untilRenderComplete';
import { Component } from 'valdi_core/src/Component';
import { IRenderedElementViewClass } from 'valdi_test/test/IRenderedElementViewClass';
import type { IComponentTestDriver } from 'valdi_test/test/JSXTestUtils';
import { valdiIt } from 'valdi_test/test/JSXTestUtils';
import { editTextEvent, touchEvent } from '../util/testEvents';

const KITCHEN: ProbedPlayer = {
	baseUrl: 'http://192.168.1.42:45889',
	id: '0123456789abcdef',
	name: 'Kitchen',
};

class ModalHost extends Component<AddPlayerModalViewModel> {
	onRender(): void {
		<view>
			<AddPlayerModal {...this.viewModel} />
		</view>;
	}
}

describe('AddPlayerModal address step', () => {
	valdiIt('keeps continue disabled until an address is typed', async (driver) => {
		const component = render(driver, {});

		expect(continueButton(component)?.getAttribute('onTap')).toBe(undefined);
	});

	valdiIt('enables continue once an address is typed', async (driver) => {
		const component = render(driver, {});

		type(component, '192.168.1.42:45889');

		expect(typeof continueButton(component)?.getAttribute('onTap')).toBe('function');
	});

	valdiIt('hands the typed address to onProbe', async (driver) => {
		const addresses: Array<string> = [];
		const component = render(driver, {
			onProbe: (address: string) => {
				addresses.push(address);
				return Promise.resolve(KITCHEN);
			},
		});

		type(component, '192.168.1.42:45889');
		tapContinue(component);

		expect(addresses).toEqual(['192.168.1.42:45889']);
	});

	valdiIt('asks for the code under the name the player reported', async (driver) => {
		const component = await atCodeStep(driver, {});

		expect(labelValues(component)).toContain(Strings.playersAddPairWith(KITCHEN.name));
		expect(codeInput(component)).toBeDefined();
	});

	valdiIt('does not ask for a code while the address is unresolved', async (driver) => {
		const component = render(driver, {});

		expect(codeInput(component)).toBe(undefined);
	});

	valdiIt('says an address it cannot parse is not an address', async (driver) => {
		const component = await probeRejecting(driver, PlayerErrors.INVALID_ADDRESS);

		expect(labelValues(component)).toContain(Strings.playersAddInvalidAddress());
	});

	valdiIt('says nothing answered when the player is unreachable', async (driver) => {
		const component = await probeRejecting(driver, PlayerErrors.PLAYER_UNREACHABLE);

		expect(labelValues(component)).toContain(Strings.playersAddUnreachable());
	});

	valdiIt('says so when something answers that is not a player', async (driver) => {
		const component = await probeRejecting(driver, PlayerErrors.NOT_AN_ATOLLA_PLAYER);

		expect(labelValues(component)).toContain(Strings.playersAddNotAPlayer());
	});

	valdiIt('stays on the address step when the probe fails', async (driver) => {
		const component = await probeRejecting(driver, PlayerErrors.PLAYER_UNREACHABLE);

		expect(codeInput(component)).toBe(undefined);
	});

	valdiIt('drops the failure once the address is edited again', async (driver) => {
		const component = await probeRejecting(driver, PlayerErrors.PLAYER_UNREACHABLE);

		type(component, '192.168.1.43:45889');

		expect(labelValues(component)).not.toContain(Strings.playersAddUnreachable());
	});
});

describe('AddPlayerModal', () => {
	valdiIt('keeps connect disabled until the code is eight digits', async (driver) => {
		const component = await atCodeStep(driver, {});

		type(component, '1234');

		expect(connectButton(component)?.getAttribute('onTap')).toBe(undefined);
	});

	valdiIt('enables connect on an eight digit code', async (driver) => {
		const component = await atCodeStep(driver, {});

		type(component, '12345678');

		expect(typeof connectButton(component)?.getAttribute('onTap')).toBe('function');
	});

	valdiIt('refuses a code of the right length that is not all digits', async (driver) => {
		const component = await atCodeStep(driver, {});

		type(component, 'abcdefgh');

		expect(connectButton(component)?.getAttribute('onTap')).toBe(undefined);
	});

	valdiIt('hands the typed code to onAdd', async (driver) => {
		const codes: Array<string> = [];
		const component = await atCodeStep(driver, {
			onAdd: (code: string) => {
				codes.push(code);
				return Promise.resolve();
			},
		});

		type(component, '87654321');
		tapConnect(component);

		expect(codes).toEqual(['87654321']);
	});

	valdiIt('closes once pairing succeeds', async (driver) => {
		let cancelled = 0;
		const component = await atCodeStep(driver, {
			onCancel: () => {
				cancelled += 1;
			},
		});

		type(component, '12345678');
		tapConnect(component);
		await untilRenderComplete(component);

		expect(cancelled).toBe(1);
	});

	valdiIt('shows the failure and stays open when pairing is refused', async (driver) => {
		let cancelled = 0;
		const component = await atCodeStep(driver, {
			onAdd: () => Promise.reject(PlayerErrors.INVALID_PAIRING_CODE),
			onCancel: () => {
				cancelled += 1;
			},
		});

		type(component, '12345678');
		tapConnect(component);
		await untilRenderComplete(component);

		expect(labelValues(component)).toContain(Strings.playersAddFailed());
		expect(cancelled).toBe(0);
	});

	valdiIt('drops the failure once the code is edited again', async (driver) => {
		const component = await atCodeStep(driver, {
			onAdd: () => Promise.reject(PlayerErrors.INVALID_PAIRING_CODE),
		});
		type(component, '12345678');
		tapConnect(component);
		await untilRenderComplete(component);

		type(component, '1234567');

		expect(labelValues(component)).not.toContain(Strings.playersAddFailed());
	});
});

type RenderedComponent = Parameters<typeof componentGetElements>[0];
type Overrides = Partial<AddPlayerModalViewModel>;

async function atCodeStep(driver: IComponentTestDriver, overrides: Overrides) {
	const component = render(driver, overrides);

	type(component, '192.168.1.42:45889');
	tapContinue(component);
	await untilRenderComplete(component);

	return component;
}

function buttonById(component: RenderedComponent, id: string) {
	return elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View).find(
		(view) => view.getAttribute('accessibilityId') === id,
	);
}

function codeInput(component: RenderedComponent) {
	return elementTypeFind(componentGetElements(component), IRenderedElementViewClass.TextField).find(
		(field) => field.getAttribute('accessibilityId') === 'add-player-code-input',
	);
}

function connectButton(component: RenderedComponent) {
	return buttonById(component, 'add-player-connect-btn');
}

function continueButton(component: RenderedComponent) {
	return buttonById(component, 'add-player-continue-btn');
}

function labelValues(component: RenderedComponent): Array<unknown> {
	return elementTypeFind(componentGetElements(component), IRenderedElementViewClass.Label).map(
		(label) => label.getAttribute('value'),
	);
}

async function probeRejecting(driver: IComponentTestDriver, error: unknown) {
	const component = render(driver, { onProbe: () => Promise.reject(error) });

	type(component, '192.168.1.42:45889');
	tapContinue(component);
	await untilRenderComplete(component);

	return component;
}

function render(driver: IComponentTestDriver, overrides: Overrides) {
	return driver.renderComponent(
		ModalHost,
		{
			onAdd: () => Promise.resolve(),
			onCancel: () => {},
			onProbe: () => Promise.resolve(KITCHEN),
			...overrides,
		},
		undefined,
	);
}

function tapConnect(component: RenderedComponent): void {
	connectButton(component)?.getAttribute('onTap')?.(touchEvent);
}

function tapContinue(component: RenderedComponent): void {
	continueButton(component)?.getAttribute('onTap')?.(touchEvent);
}

function type(component: RenderedComponent, text: string): void {
	elementTypeFind(
		componentGetElements(component),
		IRenderedElementViewClass.TextField,
	)[0]?.getAttribute('onChange')?.(editTextEvent(text));
}
