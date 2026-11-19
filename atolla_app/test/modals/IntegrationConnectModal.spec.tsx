import 'jasmine/src/jasmine';
import { IntegrationErrors } from 'atolla_app/src/integrations/IntegrationErrors';
import Strings from 'atolla_app/src/Strings';
import {
	IntegrationConnectModal,
	type IntegrationConnectModalViewModel,
} from 'atolla_app/src/ui/modals/IntegrationConnectModal';
import { componentGetElements } from 'foundation/test/util/componentGetElements';
import { elementTypeFind } from 'foundation/test/util/elementTypeFind';
import { untilRenderComplete } from 'foundation/test/util/untilRenderComplete';
import { Component } from 'valdi_core/src/Component';
import { IRenderedElementViewClass } from 'valdi_test/test/IRenderedElementViewClass';
import type { IComponentTestDriver } from 'valdi_test/test/JSXTestUtils';
import { valdiIt } from 'valdi_test/test/JSXTestUtils';
import { editTextEvent, touchEvent } from '../util/testEvents';

class ModalHost extends Component<IntegrationConnectModalViewModel> {
	onRender(): void {
		<view>
			<IntegrationConnectModal {...this.viewModel} />
		</view>;
	}
}

describe('IntegrationConnectModal', () => {
	valdiIt('starts with the saved address', async (driver) => {
		const component = render(driver, { url: 'http://lidarr.local:8686' });

		expect(input(component, 'integration-url-input')?.getAttribute('value')).toBe(
			'http://lidarr.local:8686',
		);
	});

	valdiIt('keeps authenticate disabled until the api key is typed', async (driver) => {
		const component = render(driver, { url: 'http://lidarr.local:8686' });

		expect(authenticateButton(component)?.getAttribute('onTap')).toBe(undefined);
	});

	valdiIt('keeps authenticate disabled until the address is typed', async (driver) => {
		const component = render(driver, {});

		type(component, 'integration-api-key-input', 'key-1');

		expect(authenticateButton(component)?.getAttribute('onTap')).toBe(undefined);
	});

	valdiIt('enables authenticate once both are typed', async (driver) => {
		const component = render(driver, {});

		type(component, 'integration-url-input', 'http://lidarr.local:8686');
		type(component, 'integration-api-key-input', 'key-1');

		expect(typeof authenticateButton(component)?.getAttribute('onTap')).toBe('function');
	});

	valdiIt('hands the address and api key to onConnect', async (driver) => {
		const attempts: Array<{ apiKey: string; url: string }> = [];
		const component = render(driver, {
			onConnect: (url: string, apiKey: string) => {
				attempts.push({ apiKey, url });
				return Promise.resolve();
			},
		});

		type(component, 'integration-url-input', 'http://lidarr.local:8686');
		type(component, 'integration-api-key-input', 'key-1');
		tapAuthenticate(component);

		expect(attempts).toEqual([{ apiKey: 'key-1', url: 'http://lidarr.local:8686' }]);
	});

	valdiIt('closes once connected', async (driver) => {
		let cancelled = 0;
		const component = render(driver, {
			onCancel: () => {
				cancelled += 1;
			},
		});

		await authenticate(component);

		expect(cancelled).toBe(1);
	});

	valdiIt('shows the failure and stays open when the key is refused', async (driver) => {
		let cancelled = 0;
		const component = render(driver, {
			onCancel: () => {
				cancelled += 1;
			},
			onConnect: () => Promise.reject(IntegrationErrors.UNAUTHORIZED),
		});

		await authenticate(component);

		expect(labelValues(component)).toContain(Strings.errorsIntegrationUnauthorized('lidarr'));
		expect(cancelled).toBe(0);
	});

	valdiIt('says the server could not be reached', async (driver) => {
		const component = render(driver, {
			onConnect: () => Promise.reject(IntegrationErrors.UNREACHABLE),
		});

		await authenticate(component);

		expect(labelValues(component)).toContain(Strings.errorsIntegrationUnreachable('lidarr'));
	});

	valdiIt('says the server took too long', async (driver) => {
		const component = render(driver, {
			onConnect: () => Promise.reject(IntegrationErrors.TIMED_OUT),
		});

		await authenticate(component);

		expect(labelValues(component)).toContain(Strings.errorsIntegrationTimedOut('lidarr'));
	});

	valdiIt('says the address is another kind of server', async (driver) => {
		const component = render(driver, {
			onConnect: () => Promise.reject(IntegrationErrors.WRONG_SERVICE),
		});

		await authenticate(component);

		expect(labelValues(component)).toContain(Strings.errorsIntegrationWrongService('lidarr'));
	});

	valdiIt('says the request failed for anything else', async (driver) => {
		const component = render(driver, {
			onConnect: () => Promise.reject(new Error('boom')),
		});

		await authenticate(component);

		expect(labelValues(component)).toContain(Strings.errorsIntegrationRequestFailed('lidarr'));
	});

	valdiIt('drops the failure once the api key is edited again', async (driver) => {
		const component = render(driver, {
			onConnect: () => Promise.reject(IntegrationErrors.UNAUTHORIZED),
		});
		await authenticate(component);

		type(component, 'integration-api-key-input', 'key-2');

		expect(labelValues(component)).not.toContain(Strings.errorsIntegrationUnauthorized('lidarr'));
	});

	valdiIt('warns that the api key is sent unencrypted over http', async (driver) => {
		const component = render(driver, { url: 'http://lidarr.local:8686' });

		expect(labelValues(component)).toContain(Strings.integrationHttpWarning());
	});

	valdiIt('does not warn over https', async (driver) => {
		const component = render(driver, { url: 'https://lidarr.example.com' });

		expect(labelValues(component)).not.toContain(Strings.integrationHttpWarning());
	});
});

type RenderedComponent = Parameters<typeof componentGetElements>[0];
type Overrides = Partial<IntegrationConnectModalViewModel>;

async function authenticate(component: ReturnType<typeof render>): Promise<void> {
	type(component, 'integration-url-input', 'http://lidarr.local:8686');
	type(component, 'integration-api-key-input', 'key-1');
	tapAuthenticate(component);
	await untilRenderComplete(component);
}

function authenticateButton(component: RenderedComponent) {
	return elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View).find(
		(view) => view.getAttribute('accessibilityId') === 'integration-authenticate-btn',
	);
}

function input(component: RenderedComponent, id: string) {
	return elementTypeFind(componentGetElements(component), IRenderedElementViewClass.TextField).find(
		(field) => field.getAttribute('accessibilityId') === id,
	);
}

function labelValues(component: RenderedComponent): Array<unknown> {
	return elementTypeFind(componentGetElements(component), IRenderedElementViewClass.Label).map(
		(label) => label.getAttribute('value'),
	);
}

function render(driver: IComponentTestDriver, overrides: Overrides) {
	return driver.renderComponent(
		ModalHost,
		{
			name: 'lidarr',
			onCancel: () => {},
			onConnect: () => Promise.resolve(),
			url: '',
			...overrides,
		},
		undefined,
	);
}

function tapAuthenticate(component: RenderedComponent): void {
	authenticateButton(component)?.getAttribute('onTap')?.(touchEvent);
}

function type(component: RenderedComponent, id: string, text: string): void {
	input(component, id)?.getAttribute('onChange')?.(editTextEvent(text));
}
