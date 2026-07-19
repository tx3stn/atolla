import 'jasmine/src/jasmine';
import type { Genre } from 'atolla/src/models/Genre';
import { GenrePills } from 'atolla/src/ui/components/GenrePills';
import { elementTypeFind } from 'foundation/test/util/elementTypeFind';
import { IRenderedElementViewClass } from 'valdi_test/test/IRenderedElementViewClass';
import { InstrumentedComponentJSX, valdiIt } from 'valdi_test/test/JSXTestUtils';
import { touchEvent } from '../util/testEvents';

function makeViewModel(genres: Array<Genre>, onGenreTap: (genre: Genre) => void = () => {}) {
	return {
		accessibilityId: 'album-genres',
		genres,
		onGenreTap,
	};
}

function pillView(component: GenrePills, genreId: string) {
	return elementTypeFind(
		component.renderer.getComponentRootElements(component, true),
		IRenderedElementViewClass.View,
	).find((view) => view.getAttribute('accessibilityId') === `album-genres-pill-${genreId}`);
}

describe('GenrePills', () => {
	valdiIt('taps the selected genre', async (driver) => {
		const tapped: Array<Genre> = [];
		const component = driver.renderComponent(
			GenrePills,
			makeViewModel([{ id: 'rock', name: 'Rock' }], (genre) => tapped.push(genre)),
			undefined,
		);

		pillView(component, 'rock')?.getAttribute('onTap')?.(touchEvent);

		expect(tapped).toEqual([{ id: 'rock', name: 'Rock' }]);
	});

	// normalizeGenres allocates fresh Genre objects per call, so a refetch replaces every object
	// with an equal-id copy. handlers cached against the first object would report the old name
	valdiIt('taps the current genre after the collection is replaced', async () => {
		const tapped: Array<Genre> = [];
		const onGenreTap = (genre: Genre): void => {
			tapped.push(genre);
		};
		const instrumented = InstrumentedComponentJSX.create(
			GenrePills,
			makeViewModel([{ id: 'rock', name: 'Rock' }], onGenreTap),
			undefined,
		);
		const component = instrumented.getComponent();

		instrumented.setViewModel(makeViewModel([{ id: 'rock', name: 'Rock & Roll' }], onGenreTap));
		pillView(component, 'rock')?.getAttribute('onTap')?.(touchEvent);

		expect(tapped).toEqual([{ id: 'rock', name: 'Rock & Roll' }]);
	});

	valdiIt('does nothing when the tapped genre is no longer in the collection', async () => {
		const tapped: Array<Genre> = [];
		const onGenreTap = (genre: Genre): void => {
			tapped.push(genre);
		};
		const instrumented = InstrumentedComponentJSX.create(
			GenrePills,
			makeViewModel([{ id: 'rock', name: 'Rock' }], onGenreTap),
			undefined,
		);
		const component = instrumented.getComponent();
		const handler = pillView(component, 'rock')?.getAttribute('onTap');
		expect(handler).toBeDefined();

		instrumented.setViewModel(makeViewModel([{ id: 'jazz', name: 'Jazz' }], onGenreTap));
		handler?.(touchEvent);

		expect(tapped).toEqual([]);
	});

	valdiIt('reuses the same handler for a genre across renders', async () => {
		const instrumented = InstrumentedComponentJSX.create(
			GenrePills,
			makeViewModel([{ id: 'rock', name: 'Rock' }]),
			undefined,
		);
		const component = instrumented.getComponent();
		const first = pillView(component, 'rock')?.getAttribute('onTap');
		expect(first).toBeDefined();

		instrumented.setViewModel(makeViewModel([{ id: 'rock', name: 'Rock' }]));

		expect(pillView(component, 'rock')?.getAttribute('onTap')).toBe(first);
	});
});
