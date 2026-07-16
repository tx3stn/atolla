import 'jasmine/src/jasmine';
import { ErrorBoundary } from 'atolla/src/ui/components/ErrorBoundary';
import { componentGetElements } from 'foundation/test/util/componentGetElements';
import { elementTypeFind } from 'foundation/test/util/elementTypeFind';
import { Component } from 'valdi_core/src/Component';
import { Device } from 'valdi_core/src/Device';
import { IRenderedElementViewClass } from 'valdi_test/test/IRenderedElementViewClass';
import { valdiIt } from 'valdi_test/test/JSXTestUtils';
import { touchEvent } from '../util/testEvents';

interface FlakyChildViewModel {
	throws: boolean;
}

class FlakyChild extends Component<FlakyChildViewModel> {
	onRender(): void {
		if (this.viewModel.throws) {
			throw new Error('boom');
		}
		<view accessibilityId='child-content' />;
	}
}

// the boundary renders the fallback view itself, so it appears in the boundary's own
// elements. the slotted children belong to the child component, not the boundary, so we
// assert recovery via state
function showsFallback(boundary: ErrorBoundary): boolean {
	const views = elementTypeFind(componentGetElements(boundary), IRenderedElementViewClass.View);
	return views.some((view) => view.getAttribute('accessibilityId') === 'error-boundary-fallback');
}

function fallbackLabelValues(boundary: ErrorBoundary) {
	const labels = elementTypeFind(componentGetElements(boundary), IRenderedElementViewClass.Label);
	return labels.map((label) => label.getAttribute('value'));
}

function tapDetails(boundary: ErrorBoundary): void {
	const details = elementTypeFind(
		componentGetElements(boundary),
		IRenderedElementViewClass.View,
	).find((view) => view.getAttribute('accessibilityId') === 'error-boundary-details');
	details?.getAttribute('onTap')?.(touchEvent);
}

describe('ErrorBoundary', () => {
	valdiIt('renders a fallback instead of crashing when a child throws', async (driver) => {
		const nodes = driver.render(() => {
			<ErrorBoundary resetKey='track-1'>
				<FlakyChild throws={true} />
			</ErrorBoundary>;
		});

		const boundary = nodes[0].component as ErrorBoundary;
		expect(boundary.state?.error).not.toBeNull();
		expect(showsFallback(boundary)).toBe(true);
	});

	valdiIt('surfaces the thrown error message in the fallback', async (driver) => {
		const nodes = driver.render(() => {
			<ErrorBoundary resetKey='track-1'>
				<FlakyChild throws={true} />
			</ErrorBoundary>;
		});

		const boundary = nodes[0].component as ErrorBoundary;
		expect(fallbackLabelValues(boundary)).toContain('boom');
	});

	valdiIt(
		'copies the error details to the clipboard when the section is tapped',
		async (driver) => {
			const copySpy = spyOn(Device, 'copyToClipBoard');

			const nodes = driver.render(() => {
				<ErrorBoundary resetKey='track-1'>
					<FlakyChild throws={true} />
				</ErrorBoundary>;
			});

			tapDetails(nodes[0].component as ErrorBoundary);

			expect(copySpy).toHaveBeenCalled();
			expect(copySpy.calls.mostRecent().args[0] as string).toContain('boom');
		},
	);

	valdiIt('clears the error and renders children when resetKey changes', async (driver) => {
		driver.render(() => {
			<ErrorBoundary resetKey='track-1'>
				<FlakyChild throws={true} />
			</ErrorBoundary>;
		});

		const nodes = driver.render(() => {
			<ErrorBoundary resetKey='track-2'>
				<FlakyChild throws={false} />
			</ErrorBoundary>;
		});

		const boundary = nodes[0].component as ErrorBoundary;
		expect(boundary.state?.error).toBeNull();
		expect(showsFallback(boundary)).toBe(false);
	});
});
