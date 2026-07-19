import 'jasmine/src/jasmine';
import { AuthErrors } from 'atolla/src/services/AuthErrors';
import { ConnectionView } from 'atolla/src/ui/views/ConnectionView';
import { componentGetElements } from 'foundation/test/util/componentGetElements';
import { elementTypeFind } from 'foundation/test/util/elementTypeFind';
import { IRenderedElementViewClass } from 'valdi_test/test/IRenderedElementViewClass';
import { InstrumentedComponentJSX, valdiIt } from 'valdi_test/test/JSXTestUtils';
import { editTextEvent, touchEvent } from '../util/testEvents';

function findSpinner(component: ConnectionView) {
	const elements = componentGetElements(component);
	const byLabel = elements.find((el) => {
		const label = el.getAttribute('accessibilityLabel');
		return label === 'waiting for quick connect' || label === 'spinner';
	});
	if (byLabel) {
		return byLabel;
	}

	const images = elementTypeFind(elements, IRenderedElementViewClass.Image);
	return images.length > 1 ? images[1] : undefined;
}

function makeViewModel(overrides = {}) {
	return {
		errorMessage: null,
		isConnecting: false,
		onCancelConnect: () => {},
		onConnect: () => {},
		quickConnectCode: null,
		serverUrl: '',
		...overrides,
	};
}

function getTextField(component: ConnectionView) {
	const textFields = elementTypeFind(
		componentGetElements(component),
		IRenderedElementViewClass.TextField,
	);
	return textFields[0];
}

function getConnectButton(component: ConnectionView) {
	const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
	return views.find((view) => view.getAttribute('accessibilityLabel') === 'connection-connect-btn');
}

describe('ConnectionView', () => {
	valdiIt('enables connect button when url is entered', async (driver) => {
		const component = driver.renderComponent(ConnectionView, makeViewModel(), undefined);
		const textField = getTextField(component);

		textField.getAttribute('onChange')?.(editTextEvent('https://demo.jellyfin.local'));

		const connectButton = getConnectButton(component);
		expect(typeof connectButton?.getAttribute('onTap')).toBe('function');
	});

	valdiIt('calls onConnect with trimmed input when connect is tapped', async (driver) => {
		const calls: Array<string> = [];
		const component = driver.renderComponent(
			ConnectionView,
			makeViewModel({
				onConnect: (serverUrl: string) => {
					calls.push(serverUrl);
				},
			}),
			undefined,
		);
		const textField = getTextField(component);

		textField.getAttribute('onChange')?.(editTextEvent('  demo.jellyfin.local  '));

		getConnectButton(component)?.getAttribute('onTap')?.(touchEvent);

		expect(calls).toEqual(['demo.jellyfin.local']);
	});

	valdiIt('keeps connect button disabled for whitespace-only input', async (driver) => {
		const component = driver.renderComponent(ConnectionView, makeViewModel(), undefined);
		const textField = getTextField(component);

		textField.getAttribute('onChange')?.(editTextEvent('   '));

		const connectButton = getConnectButton(component);
		expect(connectButton?.getAttribute('onTap')).toBeUndefined();
	});

	valdiIt('accepts event-shaped input payloads and enables connect button', async (driver) => {
		const component = driver.renderComponent(ConnectionView, makeViewModel(), undefined);
		const textField = getTextField(component);

		textField.getAttribute('onChange')?.(editTextEvent('demo.jellyfin.local'));

		const connectButton = getConnectButton(component);
		expect(typeof connectButton?.getAttribute('onTap')).toBe('function');
	});

	valdiIt('passes mock input through onConnect when connect is tapped', async (driver) => {
		const calls: Array<string> = [];
		const component = driver.renderComponent(
			ConnectionView,
			makeViewModel({
				onConnect: (serverUrl: string) => {
					calls.push(serverUrl);
				},
			}),
			undefined,
		);
		const textField = getTextField(component);

		textField.getAttribute('onChange')?.(editTextEvent('mock'));
		getConnectButton(component)?.getAttribute('onTap')?.(touchEvent);

		expect(calls).toEqual(['mock']);
	});

	// ConnectionView.onViewModelUpdate calls setState, so re-rendering it through the shared
	// driver renderer re-enters ('Already rendering'). root-mount it via InstrumentedComponentJSX
	// so setViewModel re-renders the component on its own renderer, matching production semantics
	valdiIt(
		'keeps typed URL and re-enables connect after failed attempt view-model update',
		async () => {
			const instrumented = InstrumentedComponentJSX.create(
				ConnectionView,
				makeViewModel(),
				undefined,
			);
			const component = instrumented.getComponent();
			const textField = getTextField(component);

			textField.getAttribute('onChange')?.(editTextEvent('http://127.0.0.1:18096'));

			instrumented.setViewModel(
				makeViewModel({
					isConnecting: true,
					serverUrl: 'http://127.0.0.1:18096',
				}),
			);

			instrumented.setViewModel(
				makeViewModel({
					errorMessage: AuthErrors.CONNECTION_ERROR,
					isConnecting: false,
					serverUrl: '',
				}),
			);

			expect(getTextField(component)?.getAttribute('value')).toBe('http://127.0.0.1:18096');
			expect(typeof getConnectButton(component)?.getAttribute('onTap')).toBe('function');
		},
	);

	valdiIt('cancels the in-flight connect when the url is edited', async (driver) => {
		let cancels = 0;
		const component = driver.renderComponent(
			ConnectionView,
			makeViewModel({
				isConnecting: true,
				onCancelConnect: () => {
					cancels += 1;
				},
			}),
			undefined,
		);

		getTextField(component).getAttribute('onChange')?.(editTextEvent('https://corrected:8096'));

		expect(cancels).toBe(1);
	});

	valdiIt('cancels when an error is showing so the stale message clears', async (driver) => {
		let cancels = 0;
		const component = driver.renderComponent(
			ConnectionView,
			makeViewModel({
				errorMessage: AuthErrors.CONNECTION_ERROR,
				isConnecting: false,
				onCancelConnect: () => {
					cancels += 1;
				},
			}),
			undefined,
		);

		getTextField(component).getAttribute('onChange')?.(editTextEvent('https://corrected:8096'));

		expect(cancels).toBe(1);
	});

	// onChange fires per keystroke and can re-fire with an unchanged value, so an idle screen must
	// not push a state update into the app on every character typed
	valdiIt('does not cancel while idle with nothing in flight', async (driver) => {
		let cancels = 0;
		const component = driver.renderComponent(
			ConnectionView,
			makeViewModel({
				onCancelConnect: () => {
					cancels += 1;
				},
			}),
			undefined,
		);

		getTextField(component).getAttribute('onChange')?.(editTextEvent('https://server:8096'));

		expect(cancels).toBe(0);
	});

	valdiIt('does not cancel when the value is unchanged', async (driver) => {
		let cancels = 0;
		const component = driver.renderComponent(
			ConnectionView,
			makeViewModel({
				isConnecting: true,
				onCancelConnect: () => {
					cancels += 1;
				},
				serverUrl: 'https://server:8096',
			}),
			undefined,
		);

		getTextField(component).getAttribute('onChange')?.(editTextEvent('https://server:8096'));

		expect(cancels).toBe(0);
	});

	valdiIt('drops the spinner and re-enables connect once the cancel lands', async () => {
		const instrumented = InstrumentedComponentJSX.create(
			ConnectionView,
			makeViewModel({ isConnecting: true, serverUrl: 'https://wrong:8096' }),
			undefined,
		);
		const component = instrumented.getComponent();

		getTextField(component).getAttribute('onChange')?.(editTextEvent('https://corrected:8096'));

		// what SessionManager.cancelLogin applies: all three cleared in one update
		instrumented.setViewModel(
			makeViewModel({
				errorMessage: null,
				isConnecting: false,
				quickConnectCode: null,
				serverUrl: 'https://wrong:8096',
			}),
		);

		expect(findSpinner(component)).toBeUndefined();
		expect(getTextField(component)?.getAttribute('value')).toBe('https://corrected:8096');
		expect(typeof getConnectButton(component)?.getAttribute('onTap')).toBe('function');
	});

	valdiIt('shows spinner immediately when isConnecting is true', async (driver) => {
		const component = driver.renderComponent(
			ConnectionView,
			makeViewModel({ isConnecting: true }),
			undefined,
		);
		expect(findSpinner(component)).toBeDefined();
	});

	valdiIt('hides spinner when not connecting', async (driver) => {
		const component = driver.renderComponent(ConnectionView, makeViewModel(), undefined);
		expect(findSpinner(component)).toBeUndefined();
	});

	valdiIt(
		'does not call onConnect directly when http:// url is entered — modal gate applies',
		async (driver) => {
			const calls: Array<string> = [];
			const component = driver.renderComponent(
				ConnectionView,
				makeViewModel({
					onConnect: (serverUrl: string) => {
						calls.push(serverUrl);
					},
				}),
				undefined,
			);
			const textField = getTextField(component);

			textField.getAttribute('onChange')?.(editTextEvent('http://192.168.1.1:8096'));
			getConnectButton(component)?.getAttribute('onTap')?.(touchEvent);

			expect(calls).toEqual([]);
		},
	);

	valdiIt(
		'allows retry tap when error is shown even if connecting flag is stale true',
		async (driver) => {
			const calls: Array<string> = [];
			const component = driver.renderComponent(
				ConnectionView,
				makeViewModel({
					errorMessage: AuthErrors.CONNECTION_ERROR,
					isConnecting: true,
					onConnect: (serverUrl: string) => {
						calls.push(serverUrl);
					},
				}),
				undefined,
			);
			const textField = getTextField(component);

			textField.getAttribute('onChange')?.(editTextEvent('https://127.0.0.1:18096'));
			getConnectButton(component)?.getAttribute('onTap')?.(touchEvent);

			expect(calls).toEqual(['https://127.0.0.1:18096']);
		},
	);
});
