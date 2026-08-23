import 'jasmine/src/jasmine';
import type { LyricsService } from 'atolla_app/src/services/LyricsService';
import { Preferences } from 'atolla_app/src/stores/Preferences';
import { GenresView } from 'atolla_app/src/ui/views/GenresView';
import { makeTestViewCache } from 'atolla_app/test/util/viewCache';
import { componentGetElements } from 'foundation/test/util/componentGetElements';
import { elementTypeFind } from 'foundation/test/util/elementTypeFind';
import { IRenderedElementViewClass } from 'valdi_test/test/IRenderedElementViewClass';
import { valdiIt } from 'valdi_test/test/JSXTestUtils';

const playbackStore = {
	subscribe: () => () => {},
	track: null,
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
			isOfflineMode: false,
			lyricsService: {} as LyricsService,
			navigationController: makeNavigationController(),
			playbackStore,
			preferences: makePreferences(),
			transport,
			viewCache: makeTestViewCache(),
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
				isOfflineMode: true,
				navigationController: makeNavigationController(),
				playbackStore,
				preferences: makePreferences(),
				transport,
				viewCache: makeTestViewCache(),
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
			isOfflineMode: true,
			navigationController: makeNavigationController(),
			playbackStore,
			preferences: makePreferences(),
			transport,
			viewCache: makeTestViewCache(),
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
