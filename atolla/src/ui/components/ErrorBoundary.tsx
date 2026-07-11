import { StatefulComponent } from 'valdi_core/src/Component';
import { getLogger } from '../../services/Logger';

const log = getLogger('ErrorBoundary');

export interface ErrorBoundaryViewModel {
	// changing this clears a caught error and retries rendering: pass an id for the current content
	// (e.g. active track id) so the next track recovers from a previous render crash
	resetKey?: string | number;
}

interface ErrorBoundaryState {
	hasError: boolean;
}

// Valdi unwinds a render exception to the nearest ancestor implementing onError; without a boundary
// a single throw below tears down the entire app in production builds, so render a fallback instead
export class ErrorBoundary extends StatefulComponent<ErrorBoundaryViewModel, ErrorBoundaryState> {
	state: ErrorBoundaryState = { hasError: false };

	onError(error: Error): void {
		log.error('caught render error', {
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
