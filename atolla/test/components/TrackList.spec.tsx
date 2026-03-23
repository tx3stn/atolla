// @ts-nocheck
import 'jasmine/src/jasmine';
import { theme } from 'atolla/src/theme';
import { TrackList } from 'atolla/src/ui/components/TrackList';
import { componentGetElements } from 'foundation/test/util/componentGetElements';
import { elementTypeFind } from 'foundation/test/util/elementTypeFind';
import { IRenderedElementViewClass } from 'valdi_test/test/IRenderedElementViewClass';
import { createComponent, valdiIt } from 'valdi_test/test/JSXTestUtils';

describe('TrackList', () => {
	valdiIt('shows empty state when no tracks are provided', () => {
		const instrumented = createComponent(TrackList, { tracks: [] });
		const component = instrumented.getComponent();

		const labels = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.Label,
		);
		expect(labels.length).toBe(1);
		expect(labels[0].getAttribute('value')).toBe('No tracks found.');
	});

	valdiIt('renders a row for each track', () => {
		const tracks = [
			{ id: 'a', meta: '3:00', title: 'Song One' },
			{ id: 'b', meta: '4:30', title: 'Song Two' },
		];
		const instrumented = createComponent(TrackList, { tracks });
		const component = instrumented.getComponent();

		const rows = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		expect(rows.length).toBe(2);
	});

	valdiIt('renders track title and meta labels', () => {
		const tracks = [{ id: 'a', meta: '2:15', title: 'Track Name' }];
		const instrumented = createComponent(TrackList, { tracks });
		const component = instrumented.getComponent();

		const labels = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.Label,
		);
		const values = labels.map((l) => l.getAttribute('value'));
		expect(values).toContain('Track Name');
		expect(values).toContain('2:15');
	});

	valdiIt('calls onTrackTap with track id when row is tapped', () => {
		const tracks = [{ id: 'track-1', meta: '1:00', title: 'Tap Me' }];
		let tappedId = '';
		const instrumented = createComponent(TrackList, {
			onTrackTap: (id: string) => {
				tappedId = id;
			},
			tracks,
		});
		const component = instrumented.getComponent();

		const rows = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		rows[0].getAttribute('onTap')?.();

		expect(tappedId).toBe('track-1');
	});

	valdiIt('renders leading label when no artwork is provided', () => {
		const tracks = [{ id: 'a', leadingLabel: '1', meta: '1:00', title: 'Track' }];
		const instrumented = createComponent(TrackList, { tracks });
		const component = instrumented.getComponent();

		const labels = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.Label,
		);
		const values = labels.map((l) => l.getAttribute('value'));
		expect(values).toContain('1');
	});

	valdiIt('updates when tracks viewModel changes', () => {
		const instrumented = createComponent(TrackList, { tracks: [] });
		const component = instrumented.getComponent();

		let labels = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.Label);
		expect(labels[0].getAttribute('value')).toBe('No tracks found.');

		instrumented.setViewModel({ tracks: [{ id: 'x', meta: '5:00', title: 'New Track' }] });
		labels = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.Label);
		const values = labels.map((l) => l.getAttribute('value'));
		expect(values).toContain('New Track');
	});

	valdiIt('applies palette colors to row and labels when palette is provided', () => {
		const palette = {
			on_surface: { hex: '#ffeeaa' },
			primary: { hex: '#ff6600' },
			surface: { hex: '#223344' },
		};
		const tracks = [{ id: 'a', meta: '2:15', title: 'Track Name' }];
		const instrumented = createComponent(TrackList, { palette, tracks });
		const component = instrumented.getComponent();

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const row = views.find((view) => view.getAttribute('testID') === 'track-row-a');
		expect(row?.getAttribute('style').attributes.backgroundColor).toBe('#223344');

		const labels = elementTypeFind(
			componentGetElements(component),
			IRenderedElementViewClass.Label,
		);
		const title = labels.find((label) => label.getAttribute('value') === 'Track Name');
		const meta = labels.find((label) => label.getAttribute('value') === '2:15');
		expect(title?.getAttribute('style').attributes.color).toBe('#ffeeaa');
		expect(meta?.getAttribute('style').attributes.color).toBe('#ffeeaa');
	});

	valdiIt('falls back to theme colors when palette is not provided', () => {
		const tracks = [{ id: 'a', meta: '2:15', title: 'Track Name' }];
		const instrumented = createComponent(TrackList, { tracks });
		const component = instrumented.getComponent();

		const views = elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View);
		const row = views.find((view) => view.getAttribute('testID') === 'track-row-a');
		expect(row?.getAttribute('style').attributes.backgroundColor).toBe(theme.colors.bg);
	});
});
