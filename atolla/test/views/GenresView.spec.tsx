import 'jasmine/src/jasmine';
import { Preferences } from 'atolla/src/stores/Preferences';
import { GenresView } from 'atolla/src/ui/views/GenresView';
import { componentGetElements } from 'foundation/test/util/componentGetElements';
import { elementTypeFind } from 'foundation/test/util/elementTypeFind';
import { IRenderedElementViewClass } from 'valdi_test/test/IRenderedElementViewClass';
import { valdiIt } from 'valdi_test/test/JSXTestUtils';

const playbackStore = {
	subscribe: () => () => {},
	track: null,
};

const stubImageCache = {
	prefetch: () => Promise.resolve(),
	subscribe: () => () => {},
};

function makeNavigationController() {
	let pushedComponent: unknown = null;
	let pushedViewModel: Record<string, { id?: string }> | null = null;
	const navigationController = {
		getPushed: () => ({ component: pushedComponent, viewModel: pushedViewModel }),
		push: (component: unknown, viewModel: unknown) => {
			pushedComponent = component;
			pushedViewModel = viewModel as Record<string, { id?: string }>;
		},
	};
	return navigationController;
}

async function flushAsyncWork() {
	await Promise.resolve();
	await Promise.resolve();
}

function makePreferences(): Preferences {
	return new Preferences({ fetchString: async () => '', storeString: async () => {} });
}

describe('GenresView', () => {
	valdiIt('renders genre names from state', async (driver) => {
		const genres = [
			{ id: 'genre-1', name: 'Rock' },
			{ id: 'genre-2', name: 'Jazz' },
		];
		const transport = {
			getGenres: async () => ({ hasMore: false, items: genres }),
		};

		const viewModel = {
			imageCache: stubImageCache,
			isOfflineMode: false,
			navigationController: makeNavigationController(),
			playbackStore,
			preferences: makePreferences(),
			transport,
		};
		const component = driver.renderComponent(GenresView, viewModel, undefined);
		component.setState({ genres });

		const labels = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.Label,
		);
		const values = labels.map((label) => label.getAttribute('value'));
		expect(values).toContain('Rock');
		expect(values).toContain('Jazz');
	});

	valdiIt(
		'shows the nothing-downloaded empty state when offline with no genres',
		async (driver) => {
			const transport = {
				getGenres: async () => ({ hasMore: false, items: [] }),
			};

			const viewModel = {
				imageCache: stubImageCache,
				isOfflineMode: true,
				navigationController: makeNavigationController(),
				playbackStore,
				preferences: makePreferences(),
				transport,
			};
			const component = driver.renderComponent(GenresView, viewModel, undefined);

			await flushAsyncWork();
			await flushAsyncWork();

			const views = elementTypeFind(
				componentGetElements(component),
				IRenderedElementViewClass.View,
			);
			const emptyState = views.find(
				(view) => view.getAttribute('accessibilityLabel') === 'library-empty-state',
			);
			expect(emptyState).toBeDefined();
		},
	);

	valdiIt('hides the empty state when offline genres are present', async (driver) => {
		const transport = {
			getGenres: async () => ({ hasMore: false, items: [{ id: 'genre-1', name: 'Rock' }] }),
		};

		const viewModel = {
			imageCache: stubImageCache,
			isOfflineMode: true,
			navigationController: makeNavigationController(),
			playbackStore,
			preferences: makePreferences(),
			transport,
		};
		const component = driver.renderComponent(GenresView, viewModel, undefined);

		await flushAsyncWork();
		await flushAsyncWork();

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const emptyState = views.find(
			(view) => view.getAttribute('accessibilityLabel') === 'library-empty-state',
		);
		expect(emptyState).toBeUndefined();
	});
});
