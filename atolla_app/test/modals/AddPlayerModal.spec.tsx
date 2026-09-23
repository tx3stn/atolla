import 'jasmine/src/jasmine';
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

class ModalHost extends Component<AddPlayerModalViewModel> {
	onRender(): void {
		<view>
			<AddPlayerModal {...this.viewModel} />
		</view>;
	}
}

describe('AddPlayerModal', () => {
	valdiIt('keeps connect disabled until the code is eight digits', async (driver) => {
		const component = render(driver, { onAdd: () => Promise.resolve() });

		type(component, '1234');

		expect(connectButton(component)?.getAttribute('onTap')).toBe(undefined);
	});

	valdiIt('enables connect on an eight digit code', async (driver) => {
		const component = render(driver, { onAdd: () => Promise.resolve() });

		type(component, '12345678');

		expect(typeof connectButton(component)?.getAttribute('onTap')).toBe('function');
	});

	valdiIt('refuses a code of the right length that is not all digits', async (driver) => {
		const component = render(driver, { onAdd: () => Promise.resolve() });

		type(component, 'abcdefgh');

		expect(connectButton(component)?.getAttribute('onTap')).toBe(undefined);
	});

	valdiIt('hands the typed code to onAdd', async (driver) => {
		const codes: Array<string> = [];
		const component = render(driver, {
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
		const component = render(driver, {
			onAdd: () => Promise.resolve(),
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
		const component = render(driver, {
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
		const component = render(driver, {
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

function connectButton(component: RenderedComponent) {
	return elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View).find(
		(view) => view.getAttribute('accessibilityId') === 'add-player-connect-btn',
	);
}

function labelValues(component: RenderedComponent): Array<unknown> {
	return elementTypeFind(componentGetElements(component), IRenderedElementViewClass.Label).map(
		(label) => label.getAttribute('value'),
	);
}

function render(
	driver: IComponentTestDriver,
	overrides: { onAdd: (code: string) => Promise<unknown>; onCancel?: () => void },
) {
	return driver.renderComponent(ModalHost, { onCancel: () => {}, ...overrides }, undefined);
}

function tapConnect(component: RenderedComponent): void {
	connectButton(component)?.getAttribute('onTap')?.(touchEvent);
}

function type(component: RenderedComponent, code: string): void {
	elementTypeFind(
		componentGetElements(component),
		IRenderedElementViewClass.TextField,
	)[0]?.getAttribute('onChange')?.(editTextEvent(code));
}
