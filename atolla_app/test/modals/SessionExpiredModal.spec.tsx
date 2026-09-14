import 'jasmine/src/jasmine';
import Strings from 'atolla_app/src/Strings';
import type { ToastService } from 'atolla_app/src/services/ToastService';
import {
	SessionExpiredModal,
	type SessionExpiredModalViewModel,
} from 'atolla_app/src/ui/modals/SessionExpiredModal';
import { AuthErrors } from 'atolla_core/src/services/AuthErrors';
import { elementTypeFind } from 'foundation/test/util/elementTypeFind';
import { IRenderedElementViewClass } from 'valdi_test/test/IRenderedElementViewClass';
import { valdiIt } from 'valdi_test/test/JSXTestUtils';
import { touchEvent } from '../util/testEvents';

function elements(component: SessionExpiredModal) {
	return component.renderer.getComponentRootElements(component, true);
}

function labelValues(component: SessionExpiredModal): Array<unknown> {
	return elementTypeFind(elements(component), IRenderedElementViewClass.Label).map((label) =>
		label.getAttribute('value'),
	);
}

// Button and LoadingSpinner set both attributes, a bare view only carries accessibilityId
function viewWithId(component: SessionExpiredModal, accessibilityId: string) {
	return elementTypeFind(elements(component), IRenderedElementViewClass.View).find(
		(view) =>
			view.getAttribute('accessibilityId') === accessibilityId ||
			view.getAttribute('accessibilityLabel') === accessibilityId,
	);
}

function makeViewModel(
	overrides: Partial<SessionExpiredModalViewModel> = {},
): SessionExpiredModalViewModel {
	return {
		errorMessage: null,
		isConnecting: false,
		onSignIn: () => {},
		onStayOffline: () => {},
		quickConnectCode: null,
		toastService: { show: () => {} } as unknown as ToastService,
		...overrides,
	};
}

describe('SessionExpiredModal', () => {
	valdiIt('names what happened and offers both ways out', async (driver) => {
		const component = driver.renderComponent(SessionExpiredModal, makeViewModel(), undefined);

		const values = labelValues(component);
		expect(values).toContain(Strings.errorsAuthSessionExpired().toUpperCase());
		expect(values).toContain(Strings.sessionExpiredModalBody());
		expect(values).toContain(Strings.sessionExpiredStayOffline());
		expect(values).toContain(Strings.sessionExpiredSignIn());
	});

	// the panel reserves space for a code and a spinner, which is dead weight in a modal that has
	// not been asked to sign in yet
	valdiIt('shows no quick connect panel until sign in is tapped', async (driver) => {
		const component = driver.renderComponent(SessionExpiredModal, makeViewModel(), undefined);

		expect(viewWithId(component, 'waiting for quick connect')).toBeUndefined();
		expect(viewWithId(component, 'connection-quick-connect-code')).toBeUndefined();
	});

	valdiIt('shows the quick connect code once the server has issued one', async (driver) => {
		const component = driver.renderComponent(
			SessionExpiredModal,
			makeViewModel({ quickConnectCode: 'ABC123' }),
			undefined,
		);

		expect(viewWithId(component, 'connection-quick-connect-code')).toBeDefined();
		expect(labelValues(component)).toContain(Strings.quickConnectCode('ABC123'));
	});

	valdiIt('spins while the sign in is in flight', async (driver) => {
		const component = driver.renderComponent(
			SessionExpiredModal,
			makeViewModel({ isConnecting: true }),
			undefined,
		);

		expect(viewWithId(component, 'waiting for quick connect')).toBeDefined();
	});

	valdiIt('shows a failed sign in rather than closing over it', async (driver) => {
		const component = driver.renderComponent(
			SessionExpiredModal,
			makeViewModel({ errorMessage: AuthErrors.SERVER_UNREACHABLE }),
			undefined,
		);

		expect(labelValues(component)).toContain(Strings.errorsAuthServerUnreachable());
	});

	valdiIt('sign in asks its host to re-authenticate', async (driver) => {
		let signIns = 0;
		const component = driver.renderComponent(
			SessionExpiredModal,
			makeViewModel({ onSignIn: () => (signIns += 1) }),
			undefined,
		);

		viewWithId(component, 'session-expired-sign-in-btn')?.getAttribute('onTap')?.(touchEvent);

		expect(signIns).toBe(1);
	});

	// tapping it twice would start a second quick connect and strand the code the user is looking at
	valdiIt('stops accepting sign in taps while one is already running', async (driver) => {
		let signIns = 0;
		const component = driver.renderComponent(
			SessionExpiredModal,
			makeViewModel({ isConnecting: true, onSignIn: () => (signIns += 1) }),
			undefined,
		);

		viewWithId(component, 'session-expired-sign-in-btn')?.getAttribute('onTap')?.(touchEvent);

		expect(signIns).toBe(0);
	});

	valdiIt('stay offline dismisses', async (driver) => {
		let dismissals = 0;
		const component = driver.renderComponent(
			SessionExpiredModal,
			makeViewModel({ onStayOffline: () => (dismissals += 1) }),
			undefined,
		);

		viewWithId(component, 'session-expired-stay-offline-btn')?.getAttribute('onTap')?.(touchEvent);

		expect(dismissals).toBe(1);
	});
});
