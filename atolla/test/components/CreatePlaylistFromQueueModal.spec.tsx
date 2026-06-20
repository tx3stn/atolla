import 'jasmine/src/jasmine';
import {
	CreatePlaylistFromQueueModal,
	type QueueTrackSelectionOptions,
} from 'atolla/src/ui/components/CreatePlaylistFromQueueModal';
import { elementTypeFind } from 'foundation/test/util/elementTypeFind';
import type { IComponent } from 'valdi_core/src/IComponent';
import { IRenderedElementViewClass } from 'valdi_test/test/IRenderedElementViewClass';
import { valdiIt } from 'valdi_test/test/JSXTestUtils';
import { editTextEvent, touchEvent } from '../util/testEvents';

function labelValues(component: IComponent): Array<string> {
	const labels = elementTypeFind(
		component.renderer.getComponentRootElements(component, true),
		IRenderedElementViewClass.Label,
	);
	return labels.map((label) => label.getAttribute('value') as string);
}

function tap(component: IComponent, accessibilityId: string): void {
	const views = elementTypeFind(
		component.renderer.getComponentRootElements(component, true),
		IRenderedElementViewClass.View,
	);
	views
		.find((v) => v.getAttribute('accessibilityLabel') === accessibilityId)
		?.getAttribute('onTap')?.(touchEvent);
}

function typeName(component: IComponent, value: string): void {
	const fields = elementTypeFind(
		component.renderer.getComponentRootElements(component, true),
		IRenderedElementViewClass.TextField,
	);
	fields[0]?.getAttribute('onChange')?.(editTextEvent(value));
}

describe('CreatePlaylistFromQueueModal', () => {
	valdiIt('renders the queue title, name input and both checkbox labels', async (driver) => {
		const viewModel = {
			onCancel: () => {},
			onCreate: async () => {},
		};
		const component = driver.renderComponent(CreatePlaylistFromQueueModal, viewModel, undefined);

		const values = labelValues(component);
		expect(values).toContain('CREATE PLAYLIST FROM QUEUE');
		expect(values).toContain('include already played');
		expect(values).toContain('include up next');

		const fields = elementTypeFind(
			component.renderer.getComponentRootElements(component, true),
			IRenderedElementViewClass.TextField,
		);
		expect(fields.length).toBe(1);
	});

	valdiIt('both checkboxes are checked by default', async (driver) => {
		const viewModel = {
			onCancel: () => {},
			onCreate: async () => {},
		};
		const component = driver.renderComponent(CreatePlaylistFromQueueModal, viewModel, undefined);

		const checkmarks = labelValues(component).filter((v) => v === '✓');
		expect(checkmarks.length).toBe(2);
	});

	valdiIt('does not call onCreate when the name is empty', async (driver) => {
		let called = false;
		const viewModel = {
			onCancel: () => {},
			onCreate: async () => {
				called = true;
			},
		};
		const component = driver.renderComponent(CreatePlaylistFromQueueModal, viewModel, undefined);

		tap(component, 'create-playlist-from-queue-create-btn');

		expect(called).toBe(false);
	});

	valdiIt(
		'calls onCreate with the name and default options once a name is entered',
		async (driver) => {
			let receivedName: string | undefined;
			let receivedOptions: QueueTrackSelectionOptions | undefined;
			const viewModel = {
				onCancel: () => {},
				onCreate: async (name: string, options: QueueTrackSelectionOptions) => {
					receivedName = name;
					receivedOptions = options;
				},
			};
			const component = driver.renderComponent(CreatePlaylistFromQueueModal, viewModel, undefined);

			typeName(component, 'Road Trip');
			tap(component, 'create-playlist-from-queue-create-btn');

			expect(receivedName).toBe('Road Trip');
			expect(receivedOptions).toEqual({ includePlayed: true, includeUpNext: true });
		},
	);

	valdiIt('reflects toggled checkboxes in the options passed to onCreate', async (driver) => {
		let receivedOptions: QueueTrackSelectionOptions | undefined;
		const viewModel = {
			onCancel: () => {},
			onCreate: async (_name: string, options: QueueTrackSelectionOptions) => {
				receivedOptions = options;
			},
		};
		const component = driver.renderComponent(CreatePlaylistFromQueueModal, viewModel, undefined);

		typeName(component, 'Just Upcoming');
		tap(component, 'create-playlist-from-queue-include-played');
		tap(component, 'create-playlist-from-queue-create-btn');

		expect(receivedOptions).toEqual({ includePlayed: false, includeUpNext: true });
	});

	valdiIt('calls onCancel when cancel is tapped', async (driver) => {
		let cancelled = false;
		const viewModel = {
			onCancel: () => {
				cancelled = true;
			},
			onCreate: async () => {},
		};
		const component = driver.renderComponent(CreatePlaylistFromQueueModal, viewModel, undefined);

		tap(component, 'create-playlist-from-queue-cancel-btn');

		expect(cancelled).toBe(true);
	});
});
