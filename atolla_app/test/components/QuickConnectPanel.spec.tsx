import 'jasmine/src/jasmine';
import Strings from 'atolla_app/src/Strings';
import type { ToastService } from 'atolla_app/src/services/ToastService';
import {
	QuickConnectPanel,
	type QuickConnectPanelViewModel,
} from 'atolla_app/src/ui/components/QuickConnectPanel';
import { AuthErrors } from 'atolla_core/src/services/AuthErrors';
import { InternalError } from 'atolla_core/src/utils/Errors';
import { componentGetElements } from 'foundation/test/util/componentGetElements';
import { elementTypeFind } from 'foundation/test/util/elementTypeFind';
import { IRenderedElementViewClass } from 'valdi_test/test/IRenderedElementViewClass';
import { valdiIt } from 'valdi_test/test/JSXTestUtils';
import { touchEvent } from '../util/testEvents';

function labelValues(component: QuickConnectPanel): Array<unknown> {
	return elementTypeFind(componentGetElements(component), IRenderedElementViewClass.Label).map(
		(label) => label.getAttribute('value'),
	);
}

function codeSlot(component: QuickConnectPanel) {
	return elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View).find(
		(view) => view.getAttribute('accessibilityId') === 'connection-quick-connect-code',
	);
}

function spinner(component: QuickConnectPanel) {
	return elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View).find(
		(view) => view.getAttribute('accessibilityLabel') === 'waiting for quick connect',
	);
}

function makeViewModel(
	overrides: Partial<QuickConnectPanelViewModel> = {},
): QuickConnectPanelViewModel {
	return {
		errorMessage: null,
		isConnecting: false,
		quickConnectCode: null,
		toastService: { show: () => {} } as unknown as ToastService,
		...overrides,
	};
}

describe('QuickConnectPanel', () => {
	valdiIt('shows the code once there is one to show', async (driver) => {
		const component = driver.renderComponent(
			QuickConnectPanel,
			makeViewModel({ quickConnectCode: 'ABC123' }),
			undefined,
		);

		expect(codeSlot(component)).toBeDefined();
		expect(labelValues(component)).toContain(Strings.quickConnectCode('ABC123'));
	});

	valdiIt('renders no code slot before a code arrives', async (driver) => {
		const component = driver.renderComponent(QuickConnectPanel, makeViewModel(), undefined);

		expect(codeSlot(component)).toBeUndefined();
	});

	valdiIt('shows the spinner while connecting', async (driver) => {
		const component = driver.renderComponent(
			QuickConnectPanel,
			makeViewModel({ isConnecting: true }),
			undefined,
		);

		expect(spinner(component)).toBeDefined();
	});

	valdiIt('hides the spinner when idle', async (driver) => {
		const component = driver.renderComponent(QuickConnectPanel, makeViewModel(), undefined);

		expect(spinner(component)).toBeUndefined();
	});

	valdiIt('shows the message for the error it was given', async (driver) => {
		const component = driver.renderComponent(
			QuickConnectPanel,
			makeViewModel({ errorMessage: AuthErrors.SESSION_EXPIRED }),
			undefined,
		);

		expect(labelValues(component)).toContain(Strings.errorsAuthSessionExpired());
	});

	valdiIt('shows no error message when there is no error', async (driver) => {
		const component = driver.renderComponent(QuickConnectPanel, makeViewModel(), undefined);

		expect(labelValues(component)).not.toContain(Strings.errorsAuthSessionExpired());
	});

	valdiIt('appends the detail to the error message when one is carried', async (driver) => {
		const component = driver.renderComponent(
			QuickConnectPanel,
			makeViewModel({ errorMessage: AuthErrors.CONNECTION_ERROR.withDetail('host unreachable') }),
			undefined,
		);

		expect(labelValues(component)).toContain(`${Strings.errorsAuthConnection()}: host unreachable`);
	});

	valdiIt('falls back to the connection message for an error it does not know', async (driver) => {
		const component = driver.renderComponent(
			QuickConnectPanel,
			makeViewModel({ errorMessage: new InternalError('not_a_real_error') }),
			undefined,
		);

		expect(labelValues(component)).toContain(Strings.errorsAuthConnection());
	});

	valdiIt('toasts when the code is tapped so the copy is acknowledged', async (driver) => {
		const toasts: Array<string> = [];
		const component = driver.renderComponent(
			QuickConnectPanel,
			makeViewModel({
				quickConnectCode: 'ABC123',
				toastService: {
					show: (model: { message: string }) => toasts.push(model.message),
				} as unknown as ToastService,
			}),
			undefined,
		);

		codeSlot(component)?.getAttribute('onTap')?.(touchEvent);

		expect(toasts).toEqual([Strings.copiedToClipboard()]);
	});
});
