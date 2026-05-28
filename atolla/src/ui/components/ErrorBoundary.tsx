import { StatefulComponent } from 'valdi_core/src/Component';
import { DebugLogger } from '../../services/DebugLogger';

export interface ErrorBoundaryViewModel {
	// Changing this value clears a caught error and retries rendering the
	// children. Pass a value that identifies the current content (e.g. the active
	// track id) so the next track recovers from a previous render crash.
	resetKey?: string | number;
}

interface ErrorBoundaryState {
	hasError: boolean;
}

// Catches render exceptions thrown by descendants (Valdi unwinds to the nearest
// ancestor implementing onError) and renders a fallback instead of crashing the
// whole UI tree. Without a boundary, a single throw anywhere below tears down
// the entire app in production builds.
export class ErrorBoundary extends StatefulComponent<ErrorBoundaryViewModel, ErrorBoundaryState> {
	state: ErrorBoundaryState = { hasError: false };

	onError(error: Error): void {
		DebugLogger.log('ErrorBoundary', 'caught render error', {
			message: error?.message ?? String(error),
		});
		this.setState({ hasError: true });
	}

	onViewModelUpdate(prevViewModel?: ErrorBoundaryViewModel): void {
		if (this.state.hasError && this.viewModel.resetKey !== prevViewModel?.resetKey) {
			this.setState({ hasError: false });
		}
	}

	onRender(): void {
		if (this.state.hasError) {
			<view accessibilityId='error-boundary-fallback' />;
			return;
		}

		<slot />;
	}
}
