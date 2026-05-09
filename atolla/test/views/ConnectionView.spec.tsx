import 'jasmine/src/jasmine';
import { ConnectionView } from 'atolla/src/ui/views/ConnectionView';
import { componentGetElements } from 'foundation/test/util/componentGetElements';
import { elementTypeFind } from 'foundation/test/util/elementTypeFind';
import { IRenderedElementViewClass } from 'valdi_test/test/IRenderedElementViewClass';
import { createComponent, valdiIt } from 'valdi_test/test/JSXTestUtils';

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
	valdiIt('enables connect button when url is entered', async () => {
		const instrumented = createComponent(ConnectionView, makeViewModel());
		const component = instrumented.getComponent();
		const textField = getTextField(component);

		textField.getAttribute('onChange')?.('https://demo.jellyfin.local');

		const connectButton = getConnectButton(component);
		expect(typeof connectButton?.getAttribute('onTap')).toBe('function');
	});

	valdiIt('calls onConnect with trimmed input when connect is tapped', async () => {
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

	valdiIt('keeps connect button disabled for whitespace-only input', async () => {
		const instrumented = createComponent(ConnectionView, makeViewModel());
		const component = instrumented.getComponent();
		const textField = getTextField(component);

		textField.getAttribute('onChange')?.('   ');

		const connectButton = getConnectButton(component);
		expect(connectButton?.getAttribute('onTap')).toBeUndefined();
	});

	valdiIt('accepts event-shaped input payloads and enables connect button', async () => {
		const instrumented = createComponent(ConnectionView, makeViewModel());
		const component = instrumented.getComponent();
		const textField = getTextField(component);

		textField.getAttribute('onChange')?.({ query: 'demo.jellyfin.local' });

		const connectButton = getConnectButton(component);
		expect(typeof connectButton?.getAttribute('onTap')).toBe('function');
	});

	valdiIt('passes mock input through onConnect when connect is tapped', async () => {
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

	valdiIt(
		'keeps typed URL and re-enables connect after failed attempt view-model update',
		async () => {
			const instrumented = createComponent(ConnectionView, makeViewModel());
			const component = instrumented.getComponent();
			const textField = getTextField(component);

			textField.getAttribute('onChange')?.('http://127.0.0.1:18096');

			instrumented.setViewModel(
				makeViewModel({
					isConnecting: true,
					serverUrl: 'http://127.0.0.1:18096',
				}),
			);

			instrumented.setViewModel(
				makeViewModel({
					errorMessage: 'connection error',
					isConnecting: false,
					serverUrl: '',
				}),
			);

			expect(getTextField(component)?.getAttribute('value')).toBe('http://127.0.0.1:18096');
			expect(typeof getConnectButton(component)?.getAttribute('onTap')).toBe('function');
		},
	);

	valdiIt('shows spinner immediately when isConnecting is true', async () => {
		const instrumented = createComponent(ConnectionView, makeViewModel({ isConnecting: true }));
		expect(findSpinner(instrumented.getComponent())).toBeDefined();
	});

	valdiIt('hides spinner when not connecting', async () => {
		const instrumented = createComponent(ConnectionView, makeViewModel());
		expect(findSpinner(instrumented.getComponent())).toBeUndefined();
	});

	valdiIt(
		'does not call onConnect directly when http:// url is entered — modal gate applies',
		async () => {
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

			textField.getAttribute('onChange')?.('http://192.168.1.1:8096');
			getConnectButton(component)?.getAttribute('onTap')?.();

			expect(calls).toEqual([]);
		},
	);

	valdiIt(
		'allows retry tap when error is shown even if connecting flag is stale true',
		async () => {
			const calls: Array<string> = [];
			const instrumented = createComponent(
				ConnectionView,
				makeViewModel({
					errorMessage: 'connection error',
					isConnecting: true,
					onConnect: (serverUrl: string) => {
						calls.push(serverUrl);
					},
				}),
			);
			const component = instrumented.getComponent();
			const textField = getTextField(component);

			textField.getAttribute('onChange')?.('https://127.0.0.1:18096');
			getConnectButton(component)?.getAttribute('onTap')?.();

			expect(calls).toEqual(['https://127.0.0.1:18096']);
		},
	);
});
