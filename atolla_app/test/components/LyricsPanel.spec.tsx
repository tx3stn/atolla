import 'jasmine/src/jasmine';
import { LyricsPanel, LyricsStatuses } from 'atolla_app/src/ui/components/LyricsPanel';
import type { Lyrics } from 'atolla_core/src/models/Lyrics';
import { elementTypeFind } from 'foundation/test/util/elementTypeFind';
import { IRenderedElementViewClass } from 'valdi_test/test/IRenderedElementViewClass';
import { valdiIt } from 'valdi_test/test/JSXTestUtils';

const lyrics: Lyrics = {
	lines: [{ text: 'first line' }, { text: '' }, { text: 'third line' }],
	synced: false,
};

describe('LyricsPanel', () => {
	valdiIt('renders a line per lyric and keeps verse breaks as spacing', async (driver) => {
		const component = driver.renderComponent(
			LyricsPanel,
			{ accessibilityId: 'lyrics', lyrics, status: LyricsStatuses.loaded },
			undefined,
		);

		const labels = elementTypeFind(
			component.renderer.getComponentRootElements(component, true),
			IRenderedElementViewClass.Label,
		);

		expect(labels.map((label) => label.getAttribute('value'))).toEqual([
			'first line',
			'third line',
		]);
		expect(labels.map((label) => label.getAttribute('accessibilityLabel'))).toEqual([
			'lyrics-line-0',
			'lyrics-line-2',
		]);
	});

	valdiIt('reports a track the server has no lyrics for', async (driver) => {
		const component = driver.renderComponent(
			LyricsPanel,
			{ accessibilityId: 'lyrics', lyrics: null, status: LyricsStatuses.loaded },
			undefined,
		);

		const views = elementTypeFind(
			component.renderer.getComponentRootElements(component, true),
			IRenderedElementViewClass.View,
		);
		const labels = elementTypeFind(
			component.renderer.getComponentRootElements(component, true),
			IRenderedElementViewClass.Label,
		);

		expect(
			views.find((view) => view.getAttribute('accessibilityLabel') === 'lyrics-empty'),
		).toBeDefined();
		expect(labels.map((label) => label.getAttribute('value'))).toEqual([
			'no lyrics for this track',
		]);
	});

	valdiIt('treats an empty line list as no lyrics', async (driver) => {
		const component = driver.renderComponent(
			LyricsPanel,
			{
				accessibilityId: 'lyrics',
				lyrics: { lines: [], synced: false },
				status: LyricsStatuses.loaded,
			},
			undefined,
		);

		const views = elementTypeFind(
			component.renderer.getComponentRootElements(component, true),
			IRenderedElementViewClass.View,
		);

		expect(
			views.find((view) => view.getAttribute('accessibilityLabel') === 'lyrics-empty'),
		).toBeDefined();
	});

	valdiIt('distinguishes a failed fetch from an absent one', async (driver) => {
		const component = driver.renderComponent(
			LyricsPanel,
			{ accessibilityId: 'lyrics', lyrics: null, status: LyricsStatuses.failed },
			undefined,
		);

		const views = elementTypeFind(
			component.renderer.getComponentRootElements(component, true),
			IRenderedElementViewClass.View,
		);
		const labels = elementTypeFind(
			component.renderer.getComponentRootElements(component, true),
			IRenderedElementViewClass.Label,
		);

		expect(
			views.find((view) => view.getAttribute('accessibilityLabel') === 'lyrics-failed'),
		).toBeDefined();
		expect(labels.map((label) => label.getAttribute('value'))).toEqual(['failed to load lyrics']);
	});

	valdiIt('shows neither lyrics nor an empty state while loading', async (driver) => {
		const component = driver.renderComponent(
			LyricsPanel,
			{ accessibilityId: 'lyrics', lyrics: null, status: LyricsStatuses.loading },
			undefined,
		);

		const views = elementTypeFind(
			component.renderer.getComponentRootElements(component, true),
			IRenderedElementViewClass.View,
		);

		expect(
			views.find((view) => view.getAttribute('accessibilityLabel') === 'lyrics-empty'),
		).toBeUndefined();
		expect(
			views.find((view) => view.getAttribute('accessibilityLabel') === 'lyrics-line-0'),
		).toBeUndefined();
	});
});
