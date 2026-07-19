import 'jasmine/src/jasmine';
import { createRippleStyle } from 'atolla/src/ui/animations/Icons';
import { FormatBadge } from 'atolla/src/ui/components/FormatBadge';
import { ProgressBarPlain } from 'atolla/src/ui/components/ProgressBarPlain';
import {
	ProgressBarWaveform,
	type ProgressBarWaveformViewModel,
} from 'atolla/src/ui/components/ProgressBarWaveform';
import { Toggle } from 'atolla/src/ui/components/Toggle';
import { TrackList } from 'atolla/src/ui/components/TrackList';
import { componentGetElements } from 'foundation/test/util/componentGetElements';
import { elementTypeFind } from 'foundation/test/util/elementTypeFind';
import { IRenderedElementViewClass } from 'valdi_test/test/IRenderedElementViewClass';
import { InstrumentedComponentJSX, valdiIt } from 'valdi_test/test/JSXTestUtils';

// Style.toNative caches the marshalled result on the instance, so a factory that returns a fresh
// Style on every render re-runs the JS->native conversion every render and the cache never pays.
// reusing the instance is the whole optimisation, which makes object identity the thing to assert
function viewStyles(component: Parameters<typeof componentGetElements>[0]): Array<unknown> {
	return elementTypeFind(componentGetElements(component), IRenderedElementViewClass.View).map(
		(view) => view.getAttribute('style'),
	);
}

describe('style factory memoization', () => {
	describe('createRippleStyle', () => {
		valdiIt('returns the same instance for the same tint and hit size', async () => {
			expect(createRippleStyle('#ff0000', 40)).toBe(createRippleStyle('#ff0000', 40));
		});

		valdiIt('keys on both tint and hit size', async () => {
			const base = createRippleStyle('#ff0000', 40);

			expect(createRippleStyle('#00ff00', 40)).not.toBe(base);
			expect(createRippleStyle('#ff0000', 70)).not.toBe(base);
		});

		valdiIt('still derives the centre from the hit size it was given', async () => {
			expect(createRippleStyle('#ff0000', 70).attributes.left).toBe(35);
			expect(createRippleStyle('#ff0000', 40).attributes.left).toBe(20);
		});
	});

	valdiIt('Toggle reuses its thumb style across re-renders', async () => {
		const instrumented = InstrumentedComponentJSX.create(
			Toggle,
			{ accessibilityId: 'toggle', enabled: true, onToggle: () => {} },
			undefined,
		);
		const component = instrumented.getComponent();

		const before = viewStyles(component);
		instrumented.setViewModel({ accessibilityId: 'toggle', enabled: true, onToggle: () => {} });
		const after = viewStyles(component);

		expect(before.length).toBe(after.length);
		before.forEach((style, index) => {
			expect(after[index]).toBe(style);
		});
	});

	valdiIt('Toggle still moves the thumb when it flips', async () => {
		const instrumented = InstrumentedComponentJSX.create(
			Toggle,
			{ accessibilityId: 'toggle', enabled: false, onToggle: () => {} },
			undefined,
		);
		const component = instrumented.getComponent();

		const off = viewStyles(component);
		instrumented.setViewModel({ accessibilityId: 'toggle', enabled: true, onToggle: () => {} });
		const on = viewStyles(component);

		expect(on).not.toEqual(off);
	});

	valdiIt('FormatBadge reuses its container style across re-renders', async () => {
		const instrumented = InstrumentedComponentJSX.create(
			FormatBadge,
			{ color: '#abcdef', value: 'FLAC' },
			undefined,
		);
		const component = instrumented.getComponent();

		const before = viewStyles(component);
		instrumented.setViewModel({ color: '#abcdef', value: 'ALAC' });
		const after = viewStyles(component);

		expect(before[0]).toBe(after[0]);
	});

	valdiIt('TrackList reuses its row styles across re-renders', async () => {
		const tracks = [
			{ id: 'a', meta: '3:00', title: 'Song One' },
			{ id: 'b', meta: '2:30', title: 'Song Two' },
		];
		const instrumented = InstrumentedComponentJSX.create(TrackList, { tracks }, undefined);
		const component = instrumented.getComponent();

		const before = viewStyles(component);
		instrumented.setViewModel({ tracks: [...tracks] });
		const after = viewStyles(component);

		expect(before.length).toBe(after.length);
		before.forEach((style, index) => {
			expect(after[index]).toBe(style);
		});
	});

	valdiIt('TrackList still restyles when the palette changes', async () => {
		const tracks = [{ id: 'a', meta: '3:00', title: 'Song One' }];
		const instrumented = InstrumentedComponentJSX.create(
			TrackList,
			{ noRowBackground: false, tracks },
			undefined,
		);
		const component = instrumented.getComponent();

		const before = viewStyles(component);
		instrumented.setViewModel({ noRowBackground: true, tracks });
		const after = viewStyles(component);

		expect(after).not.toEqual(before);
	});

	valdiIt('ProgressBarWaveform reuses its tinted image styles across re-renders', async () => {
		const viewModel = {
			accentColor: '#ff0000',
			maskImageUrl: 'https://example.com/wave.png',
			mutedColor: '#333333',
			playbackStore: {
				progressSeconds: 10,
				subscribe: () => () => {},
				track: { duration: 200, id: 'track-1', name: 'Track' },
			} as unknown as ProgressBarWaveformViewModel['playbackStore'],
			trackColor: '#222222',
			trackDuration: 200,
		};
		const instrumented = InstrumentedComponentJSX.create(ProgressBarWaveform, viewModel, undefined);
		const component = instrumented.getComponent();

		const imageStyles = () =>
			elementTypeFind(componentGetElements(component), IRenderedElementViewClass.Image).map(
				(image) => image.getAttribute('style'),
			);

		const before = imageStyles();
		instrumented.setViewModel({ ...viewModel });
		const after = imageStyles();

		expect(before.length).toBeGreaterThan(0);
		before.forEach((style, index) => {
			expect(after[index]).toBe(style);
		});
	});

	valdiIt('ProgressBarPlain reuses its rail and fill styles across re-renders', async () => {
		const viewModel = {
			accentColor: '#ff0000',
			durationSeconds: 200,
			onSeek: () => {},
			progressSeconds: 50,
			trackColor: '#222222',
		};
		const instrumented = InstrumentedComponentJSX.create(ProgressBarPlain, viewModel, undefined);
		const component = instrumented.getComponent();

		const before = viewStyles(component);
		instrumented.setViewModel({ ...viewModel, progressSeconds: 90 });
		const after = viewStyles(component);

		expect(before.length).toBe(after.length);
		before.forEach((style, index) => {
			expect(after[index]).toBe(style);
		});
	});
});
