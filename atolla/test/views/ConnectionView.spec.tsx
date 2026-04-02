// @ts-nocheck
import 'jasmine/src/jasmine';
import { ConnectionView } from 'atolla/src/ui/views/ConnectionView';
import { componentGetElements } from 'foundation/test/util/componentGetElements';
import { elementTypeFind } from 'foundation/test/util/elementTypeFind';
import { IRenderedElementViewClass } from 'valdi_test/test/IRenderedElementViewClass';
import { createComponent, valdiIt } from 'valdi_test/test/JSXTestUtils';

function makeViewModel(overrides = {}) {
	return {
		errorMessage: null,
		isConnecting: false,
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
	valdiIt('enables connect button when url is entered', () => {
		const instrumented = createComponent(ConnectionView, makeViewModel());
		const component = instrumented.getComponent();
		const textField = getTextField(component);

		textField.getAttribute('onChange')?.('https://demo.jellyfin.local');

		const connectButton = getConnectButton(component);
		expect(typeof connectButton?.getAttribute('onTap')).toBe('function');
	});

	valdiIt('calls onConnect with trimmed input when connect is tapped', () => {
		const calls: Array<string> = [];
		const instrumented = createComponent(
			ConnectionView,
			makeViewModel({
				onConnect: (serverUrl: string) => {
					calls.push(serverUrl);
				},
			}),
		);
		const component = instrumented.getComponent();
		const textField = getTextField(component);

		textField.getAttribute('onChange')?.('  demo.jellyfin.local  ');

		getConnectButton(component)?.getAttribute('onTap')?.();

		expect(calls).toEqual(['demo.jellyfin.local']);
	});

	valdiIt('keeps connect button disabled for whitespace-only input', () => {
		const instrumented = createComponent(ConnectionView, makeViewModel());
		const component = instrumented.getComponent();
		const textField = getTextField(component);

		textField.getAttribute('onChange')?.('   ');

		const connectButton = getConnectButton(component);
		expect(connectButton?.getAttribute('onTap')).toBeUndefined();
	});

	valdiIt('accepts event-shaped input payloads and enables connect button', () => {
		const instrumented = createComponent(ConnectionView, makeViewModel());
		const component = instrumented.getComponent();
		const textField = getTextField(component);

		textField.getAttribute('onChange')?.({ query: 'demo.jellyfin.local' });

		const connectButton = getConnectButton(component);
		expect(typeof connectButton?.getAttribute('onTap')).toBe('function');
	});

	valdiIt('passes mock input through onConnect when connect is tapped', () => {
		const calls: Array<string> = [];
		const instrumented = createComponent(
			ConnectionView,
			makeViewModel({
				onConnect: (serverUrl: string) => {
					calls.push(serverUrl);
				},
			}),
		);
		const component = instrumented.getComponent();
		const textField = getTextField(component);

		textField.getAttribute('onChange')?.('mock');
		getConnectButton(component)?.getAttribute('onTap')?.();

		expect(calls).toEqual(['mock']);
	});
});
