import 'jasmine/src/jasmine';
import {
	CreatePlaylistFromQueueModal,
	type QueueTrackSelectionOptions,
} from 'atolla/src/ui/components/CreatePlaylistFromQueueModal';
import { elementTypeFind } from 'foundation/test/util/elementTypeFind';
import { IRenderedElementViewClass } from 'valdi_test/test/IRenderedElementViewClass';
import { createComponent, valdiIt } from 'valdi_test/test/JSXTestUtils';
import { renderedElements } from './renderedElements';

type RenderedComponent = Parameters<typeof renderedElements>[0];

function labelValues(component: RenderedComponent): Array<string> {
	const labels = elementTypeFind(renderedElements(component), IRenderedElementViewClass.Label);
	return labels.map((label) => label.getAttribute('value'));
}

function tap(component: RenderedComponent, accessibilityId: string): void {
	const views = elementTypeFind(renderedElements(component), IRenderedElementViewClass.View);
	views
		.find((v) => v.getAttribute('accessibilityLabel') === accessibilityId)
		?.getAttribute('onTap')?.();
}

function typeName(component: RenderedComponent, value: string): void {
	const fields = elementTypeFind(renderedElements(component), IRenderedElementViewClass.TextField);
	fields[0]?.getAttribute('onChange')?.(value);
}

describe('CreatePlaylistFromQueueModal', () => {
	valdiIt('renders the queue title, name input and both checkbox labels', async () => {
		const instrumented = createComponent(CreatePlaylistFromQueueModal, {
			onCancel: () => {},
			onCreate: async () => {},
		});
		const component = instrumented.getComponent();

		const values = labelValues(component);
		expect(values).toContain('CREATE PLAYLIST FROM QUEUE');
		expect(values).toContain('include already played');
		expect(values).toContain('include up next');

		const fields = elementTypeFind(
			renderedElements(component),
			IRenderedElementViewClass.TextField,
		);
		expect(fields.length).toBe(1);
	});

	valdiIt('both checkboxes are checked by default', async () => {
		const instrumented = createComponent(CreatePlaylistFromQueueModal, {
			onCancel: () => {},
			onCreate: async () => {},
		});
		const component = instrumented.getComponent();

		const checkmarks = labelValues(component).filter((v) => v === '✓');
		expect(checkmarks.length).toBe(2);
	});

	valdiIt('does not call onCreate when the name is empty', async () => {
		let called = false;
		const instrumented = createComponent(CreatePlaylistFromQueueModal, {
			onCancel: () => {},
			onCreate: async () => {
				called = true;
			},
		});
		const component = instrumented.getComponent();

		tap(component, 'create-playlist-from-queue-create-button');

		expect(called).toBe(false);
	});

	valdiIt('calls onCreate with the name and default options once a name is entered', async () => {
		let receivedName: string | undefined;
		let receivedOptions: QueueTrackSelectionOptions | undefined;
		const instrumented = createComponent(CreatePlaylistFromQueueModal, {
			onCancel: () => {},
			onCreate: async (name: string, options: QueueTrackSelectionOptions) => {
				receivedName = name;
				receivedOptions = options;
			},
		});
		const component = instrumented.getComponent();

		typeName(component, 'Road Trip');
		tap(component, 'create-playlist-from-queue-create-button');

		expect(receivedName).toBe('Road Trip');
		expect(receivedOptions).toEqual({ includePlayed: true, includeUpNext: true });
	});

	valdiIt('reflects toggled checkboxes in the options passed to onCreate', async () => {
		let receivedOptions: QueueTrackSelectionOptions | undefined;
		const instrumented = createComponent(CreatePlaylistFromQueueModal, {
			onCancel: () => {},
			onCreate: async (_name: string, options: QueueTrackSelectionOptions) => {
				receivedOptions = options;
			},
		});
		const component = instrumented.getComponent();

		typeName(component, 'Just Upcoming');
		tap(component, 'create-playlist-from-queue-include-played');
		tap(component, 'create-playlist-from-queue-create-button');

		expect(receivedOptions).toEqual({ includePlayed: false, includeUpNext: true });
	});

	valdiIt('calls onCancel when cancel is tapped', async () => {
		let cancelled = false;
		const instrumented = createComponent(CreatePlaylistFromQueueModal, {
			onCancel: () => {
				cancelled = true;
			},
			onCreate: async () => {},
		});
		const component = instrumented.getComponent();

		tap(component, 'create-playlist-from-queue-cancel-button');

		expect(cancelled).toBe(true);
	});
});
